// lib/appstore/webhookEvents.ts
// The App Store Connect side of the Discord relay: prove the POST came from
// Apple, then turn its payload into something a human can read.
//
// Apple's notifications are deliberately thin. They tell you that a state
// changed and give you an id to go look the thing up with; they do not tell
// you the app name, the version string, or the build number. So everything
// below is about squeezing meaning out of two state strings and a resource
// type, and about never dropping an event on the floor just because Apple
// added a case we have not seen yet.
import crypto from "crypto";

/// The `eventTypes` values you check off in App Store Connect, as Apple spells
/// them in the webhook configuration API. Kept here so the docs, the check
/// script and the setup instructions can all quote one list.
export const APP_STORE_WEBHOOK_EVENT_TYPES = [
  "BETA_FEEDBACK_CRASH_SUBMISSION_CREATED",
  "BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED",
  "BUILD_BETA_DETAIL_EXTERNAL_BUILD_STATE_UPDATED",
  "APP_STORE_VERSION_APP_VERSION_STATE_UPDATED",
  "BUILD_UPLOAD_STATE_UPDATED",
  "BACKGROUND_ASSET_VERSION_STATE_UPDATED",
  "BACKGROUND_ASSET_VERSION_APP_STORE_RELEASE_STATE_UPDATED",
  "BACKGROUND_ASSET_VERSION_EXTERNAL_BETA_RELEASE_STATE_UPDATED",
  "BACKGROUND_ASSET_VERSION_INTERNAL_BETA_RELEASE_CREATED",
  "ALTERNATIVE_DISTRIBUTION_PACKAGE_VERSION_CREATED",
  "ALTERNATIVE_DISTRIBUTION_PACKAGE_AVAILABLE_UPDATED",
  "ALTERNATIVE_DISTRIBUTION_TERRITORY_AVAILABILITY_UPDATED",
] as const;

export type AppStoreWebhookEventType =
  (typeof APP_STORE_WEBHOOK_EVENT_TYPES)[number];

/// How much a reader should care, which is the only thing the embed colour is
/// allowed to mean.
///
/// `working` and `review` are split because they call for different things.
/// Orange is a machine chewing on your upload and there is nothing to do.
/// Indigo is a person at Apple holding it, which is the state worth watching.
export type EventTone =
  | "good"
  | "bad"
  | "working"
  | "review"
  | "info"
  | "neutral";

export interface AppStoreWebhookPayload {
  data?: {
    type?: string;
    id?: string;
    version?: number;
    attributes?: Record<string, any>;
    relationships?: Record<string, any>;
  };
}

export interface EventDetail {
  label: string;
  value: string;
  inline?: boolean;
}

export interface NormalizedAppStoreEvent {
  /// `data.type`, camelCase, exactly as Apple sent it. Present even when we do
  /// not recognise it.
  rawType: string;
  /// The configuration-side name, when the payload type maps to one we know.
  eventType: AppStoreWebhookEventType | null;
  /// Apple's id for the notification itself, not for the thing that changed.
  eventId: string | null;
  /// The headline. Written for someone reading Discord on their phone.
  title: string;
  tone: EventTone;
  /// Prettified state names, when the event carries a transition.
  oldState: string | null;
  newState: string | null;
  /// The same two, as Apple spelled them. The embed matches on these rather
  /// than on the prettified labels, so a wording change to a label can never
  /// silently break a colour or a stage bar.
  rawOldState: string | null;
  rawNewState: string | null;
  timestamp: Date | null;
  /// The resource that actually changed, and the API URL to read it back.
  instance: { type: string | null; id: string | null; url: string | null } | null;
  /// Anything else the payload carried that is worth showing: territory lists,
  /// marketplace app ids, and so on.
  details: EventDetail[];
  /// True for the deliveries you trigger yourself from `POST /v1/webhookPings`.
  ping: boolean;
}

/// Payload `data.type` (camelCase) to configuration `eventTypes` (SCREAMING).
/// Apple uses both spellings for the same event and only documents the mapping
/// by example, so it is written out rather than derived.
const TYPE_TO_EVENT_TYPE: Record<string, AppStoreWebhookEventType> = {
  betaFeedbackCrashSubmissionCreated: "BETA_FEEDBACK_CRASH_SUBMISSION_CREATED",
  betaFeedbackScreenshotSubmissionCreated:
    "BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED",
  buildBetaDetailExternalBuildStateUpdated:
    "BUILD_BETA_DETAIL_EXTERNAL_BUILD_STATE_UPDATED",
  appStoreVersionAppVersionStateUpdated:
    "APP_STORE_VERSION_APP_VERSION_STATE_UPDATED",
  buildUploadStateUpdated: "BUILD_UPLOAD_STATE_UPDATED",
  backgroundAssetVersionStateUpdated: "BACKGROUND_ASSET_VERSION_STATE_UPDATED",
  backgroundAssetVersionAppStoreReleaseStateUpdated:
    "BACKGROUND_ASSET_VERSION_APP_STORE_RELEASE_STATE_UPDATED",
  backgroundAssetVersionExternalBetaReleaseStateUpdated:
    "BACKGROUND_ASSET_VERSION_EXTERNAL_BETA_RELEASE_STATE_UPDATED",
  backgroundAssetVersionInternalBetaReleaseCreated:
    "BACKGROUND_ASSET_VERSION_INTERNAL_BETA_RELEASE_CREATED",
  alternativeDistributionPackageVersionCreated:
    "ALTERNATIVE_DISTRIBUTION_PACKAGE_VERSION_CREATED",
  alternativeDistributionPackageAvailableUpdated:
    "ALTERNATIVE_DISTRIBUTION_PACKAGE_AVAILABLE_UPDATED",
  alternativeDistributionTerritoryAvailabilityUpdated:
    "ALTERNATIVE_DISTRIBUTION_TERRITORY_AVAILABILITY_UPDATED",
};

/// Headlines. Deliberately plain: the state transition underneath carries the
/// news, so the title only has to say which pipeline the news is about.
const TITLES: Record<AppStoreWebhookEventType, string> = {
  BETA_FEEDBACK_CRASH_SUBMISSION_CREATED: "New TestFlight crash report",
  BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED: "New TestFlight feedback",
  BUILD_BETA_DETAIL_EXTERNAL_BUILD_STATE_UPDATED: "TestFlight build status",
  APP_STORE_VERSION_APP_VERSION_STATE_UPDATED: "App Store version status",
  BUILD_UPLOAD_STATE_UPDATED: "Build upload status",
  BACKGROUND_ASSET_VERSION_STATE_UPDATED: "Asset pack version status",
  BACKGROUND_ASSET_VERSION_APP_STORE_RELEASE_STATE_UPDATED:
    "Asset pack App Store release",
  BACKGROUND_ASSET_VERSION_EXTERNAL_BETA_RELEASE_STATE_UPDATED:
    "Asset pack external TestFlight release",
  BACKGROUND_ASSET_VERSION_INTERNAL_BETA_RELEASE_CREATED:
    "Asset pack internal TestFlight release created",
  ALTERNATIVE_DISTRIBUTION_PACKAGE_VERSION_CREATED:
    "Alternative distribution package created",
  ALTERNATIVE_DISTRIBUTION_PACKAGE_AVAILABLE_UPDATED:
    "Alternative distribution availability",
  ALTERNATIVE_DISTRIBUTION_TERRITORY_AVAILABILITY_UPDATED:
    "Alternative distribution territories",
};

/// Where a state name is genuinely unclear on its own, say the useful thing
/// instead. Everything not listed falls through to title-casing, which is why
/// this table can stay short and does not need to track Apple's full enum.
const STATE_LABELS: Record<string, string> = {
  PREPARE_FOR_SUBMISSION: "Prepare for Submission",
  READY_FOR_REVIEW: "Ready for Review",
  WAITING_FOR_REVIEW: "Waiting for Review",
  IN_REVIEW: "In Review",
  PENDING_DEVELOPER_RELEASE: "Pending Developer Release",
  PENDING_APPLE_RELEASE: "Pending Apple Release",
  PENDING_CONTRACT: "Pending Contract",
  READY_FOR_DISTRIBUTION: "Ready for Distribution",
  PROCESSING_FOR_DISTRIBUTION: "Processing for Distribution",
  PREORDER_READY_FOR_SALE: "Pre-order Ready for Sale",
  DEVELOPER_REJECTED: "Developer Rejected",
  DEVELOPER_REMOVED_FROM_SALE: "Removed from Sale",
  METADATA_REJECTED: "Metadata Rejected",
  INVALID_BINARY: "Invalid Binary",
  WAITING_FOR_EXPORT_COMPLIANCE: "Waiting for Export Compliance",
  IN_EXPORT_COMPLIANCE_REVIEW: "In Export Compliance Review",
  MISSING_EXPORT_COMPLIANCE: "Missing Export Compliance",
  REPLACED_WITH_NEW_VERSION: "Replaced with New Version",
  NOT_APPLICABLE: "Not Applicable",
  PROCESSING_EXCEPTION: "Processing Failed",
  READY_FOR_BETA_TESTING: "Ready to Test",
  READY_FOR_BETA_SUBMISSION: "Ready for Beta Submission",
  WAITING_FOR_BETA_REVIEW: "Waiting for Beta Review",
  IN_BETA_REVIEW: "In Beta Review",
  IN_BETA_TESTING: "Testing",
  BETA_REJECTED: "Beta Rejected",
  BETA_APPROVED: "Beta Approved",
  AWAITING_UPLOAD: "Awaiting Upload",
};

/// Title-case an unknown SCREAMING_SNAKE state so a case Apple adds next year
/// still reads as English instead of shouting.
export function labelForState(state: string): string {
  const key = state.trim().toUpperCase();
  if (STATE_LABELS[key]) return STATE_LABELS[key];
  return key
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

/// Tone by keyword rather than by enumerating Apple's states.
///
/// Enumerating is the obvious approach and it is the wrong one here: every
/// pipeline has its own state enum, Apple adds cases without warning, and a
/// state we have never seen would come out grey and silent. Matching on the
/// words the states are built from degrades sensibly instead. Order matters,
/// because MISSING_EXPORT_COMPLIANCE is bad news while WAITING_FOR_EXPORT_
/// COMPLIANCE is merely slow.
export function toneForState(state: string | null | undefined): EventTone {
  if (!state) return "neutral";
  const s = state.toUpperCase();
  if (/FAILED|REJECT|INVALID|EXCEPTION|EXPIRED|REMOVED|CANCEL|MISSING/.test(s)) {
    return "bad";
  }
  if (
    /COMPLETE|APPROVED|ACCEPTED|READY_FOR_DISTRIBUTION|READY_FOR_SALE|READY_FOR_BETA_TESTING|IN_BETA_TESTING|PREORDER_READY_FOR_SALE/.test(
      s
    )
  ) {
    return "good";
  }
  // "Ready for" is a trap: READY_FOR_REVIEW contains the word REVIEW but
  // means nobody at Apple has it yet, and the form is still sitting on your
  // desk. It is grey, not indigo.
  if (/^READY_FOR_(REVIEW|BETA_SUBMISSION)$|^PREPARE_FOR_SUBMISSION$/.test(s)) {
    return "neutral";
  }
  if (/REVIEW|PENDING/.test(s)) return "review";
  if (/PROCESSING|WAITING|UPLOAD/.test(s)) return "working";
  return "neutral";
}

/// Apple is not consistent about where the changed resource lives. Most events
/// nest it as `relationships.instance.data`; the Background Assets ones put the
/// id and type directly on `relationships.instance`. Read both.
function readInstance(relationships: Record<string, any> | undefined) {
  const instance = relationships?.instance;
  if (!instance || typeof instance !== "object") return null;
  const inner =
    instance.data && typeof instance.data === "object" ? instance.data : instance;
  const type = typeof inner.type === "string" ? inner.type : null;
  const id = typeof inner.id === "string" ? inner.id : null;
  const url =
    typeof instance.links?.self === "string" ? instance.links.self : null;
  if (!type && !id && !url) return null;
  return { type, id, url };
}

/// Pull the transition out of whatever the event calls it. `newValue`/`oldValue`
/// for app versions, `newExternalBuildState` for TestFlight builds,
/// `newState`/`oldState` for uploads and asset packs.
function readTransition(attributes: Record<string, any> | undefined) {
  const attrs = attributes ?? {};
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = attrs[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };
  return {
    oldState: pick("oldValue", "oldState", "oldExternalBuildState"),
    newState: pick("newValue", "newState", "newExternalBuildState"),
  };
}

function readTimestamp(attributes: Record<string, any> | undefined): Date | null {
  const raw = attributes?.timestamp;
  if (typeof raw !== "string") return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

/// Turn one POST body into the single shape the embed builder renders.
///
/// Never throws and never returns null. An unrecognised payload still produces
/// an event with the raw type as its title, because a webhook that goes quiet
/// when Apple ships something new is worse than one that says "something
/// happened, here is what I got".
export function normalizeAppStoreEvent(
  payload: AppStoreWebhookPayload | null | undefined
): NormalizedAppStoreEvent {
  const data = payload?.data ?? {};
  const rawType = typeof data.type === "string" ? data.type : "unknown";
  const eventType = TYPE_TO_EVENT_TYPE[rawType] ?? null;
  const attributes = data.attributes ?? {};
  const { oldState, newState } = readTransition(attributes);
  const timestamp = readTimestamp(attributes);
  const instance = readInstance(data.relationships);
  const ping =
    attributes.ping === true ||
    /webhookping/i.test(rawType) ||
    /webhookping/i.test(instance?.type ?? "");

  const details: EventDetail[] = [];
  if (typeof attributes.appId === "string" && attributes.appId) {
    details.push({ label: "App ID", value: attributes.appId, inline: true });
  }
  if (typeof attributes.available === "boolean") {
    details.push({
      label: "Available",
      value: attributes.available ? "Yes" : "No",
      inline: true,
    });
  }
  if (Array.isArray(attributes.territories) && attributes.territories.length) {
    const codes = attributes.territories.filter(
      (code: unknown): code is string => typeof code === "string"
    );
    details.push({
      label: `Territories (${codes.length})`,
      value: codes.join(", "),
    });
  }
  const marketplace = data.relationships?.marketplaceApp?.data?.id;
  if (typeof marketplace === "string" && marketplace) {
    details.push({ label: "Marketplace app", value: marketplace, inline: true });
  }

  let title: string;
  if (ping) {
    title = "Webhook test ping";
  } else if (eventType) {
    title = TITLES[eventType];
  } else {
    title = `App Store Connect event: ${rawType}`;
  }

  let tone: EventTone;
  if (ping) {
    tone = "info";
  } else if (eventType === "BETA_FEEDBACK_CRASH_SUBMISSION_CREATED") {
    // A crash report is not a broken pipeline, but it is the one event here
    // that means someone should go look at something today.
    tone = "bad";
  } else if (eventType === "BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED") {
    tone = "info";
  } else if (newState) {
    tone = toneForState(newState);
  } else if (rawType.endsWith("Created")) {
    tone = "info";
  } else {
    tone = "neutral";
  }

  return {
    rawType,
    eventType,
    eventId: typeof data.id === "string" ? data.id : null,
    title,
    tone,
    oldState: oldState ? labelForState(oldState) : null,
    newState: newState ? labelForState(newState) : null,
    rawOldState: oldState,
    rawNewState: newState,
    timestamp,
    instance,
    details,
    ping,
  };
}

/// Constant-time check of the `x-apple-signature` header against the shared
/// secret from the webhook's configuration.
///
/// Apple sends `hmacsha256=<hex>` over the raw request body. The raw body is
/// the whole point: re-serialising the parsed JSON would reorder keys and drop
/// whitespace, and the digest would never match. The route reads `req.text()`
/// once and hands that exact string here.
export function verifyAppStoreSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Apple documents the `hmacsha256=` prefix; tolerate a bare hex digest too
  // rather than reject a real notification over a format change.
  const provided = signatureHeader.trim().replace(/^hmacsha256=/i, "").trim();
  if (provided.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

// lib/appstore/discordEmbed.ts
// The Discord half of the relay: a normalized App Store Connect event in, one
// embed out.
//
// The shape is chosen for someone glancing at a phone notification. Discord
// shows the title and little else in a preview, so the title has to be
// self-contained: which pipeline, and what just happened. Everything that only
// matters once you have opened the message lives below it, and the technical
// handles live in the footer where they are grey and out of the way.
import type { DiscordEmbed, DiscordMessage } from "@/lib/discordWebhook";
import type {
  AppStoreWebhookEventType,
  EventTone,
  NormalizedAppStoreEvent,
} from "@/lib/appstore/webhookEvents";

/// Apple's dark-appearance system palette. The dark variants, deliberately:
/// Discord is dark for most people, and the light-mode reds and greens go muddy
/// against #313338.
const TONE_COLORS: Record<EventTone, number> = {
  good: 0x30d158,
  bad: 0xff453a,
  working: 0xff9f0a,
  review: 0x5e5ce6,
  info: 0x0a84ff,
  neutral: 0x8e8e93,
};

const TONE_EMOJI: Record<EventTone, string> = {
  good: "✅",
  bad: "❌",
  working: "⚙️",
  review: "🔎",
  info: "💬",
  neutral: "⚪",
};

/// A handful of moments deserve their own emoji, because they are the ones
/// someone actually reacts to. Everything else falls back to its tone.
const STATE_EMOJI: Record<string, string> = {
  READY_FOR_BETA_TESTING: "🚀",
  IN_BETA_TESTING: "🚀",
  READY_FOR_DISTRIBUTION: "🎉",
  COMPLETE: "📦",
  FAILED: "💥",
  EXPIRED: "🕒",
  PENDING_DEVELOPER_RELEASE: "🎬",
};

/// Which part of the pipeline the news is about. Goes in the title so a
/// notification preview is never just the word "Failed".
const PIPELINES: Record<AppStoreWebhookEventType, string> = {
  BETA_FEEDBACK_CRASH_SUBMISSION_CREATED: "TestFlight",
  BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED: "TestFlight",
  BUILD_BETA_DETAIL_EXTERNAL_BUILD_STATE_UPDATED: "TestFlight",
  APP_STORE_VERSION_APP_VERSION_STATE_UPDATED: "App Store",
  BUILD_UPLOAD_STATE_UPDATED: "Build Upload",
  BACKGROUND_ASSET_VERSION_STATE_UPDATED: "Asset Pack",
  BACKGROUND_ASSET_VERSION_APP_STORE_RELEASE_STATE_UPDATED: "Asset Pack",
  BACKGROUND_ASSET_VERSION_EXTERNAL_BETA_RELEASE_STATE_UPDATED: "Asset Pack",
  BACKGROUND_ASSET_VERSION_INTERNAL_BETA_RELEASE_CREATED: "Asset Pack",
  ALTERNATIVE_DISTRIBUTION_PACKAGE_VERSION_CREATED: "Marketplace",
  ALTERNATIVE_DISTRIBUTION_PACKAGE_AVAILABLE_UPDATED: "Marketplace",
  ALTERNATIVE_DISTRIBUTION_TERRITORY_AVAILABILITY_UPDATED: "Marketplace",
};

/// For the events where the pipeline name alone is ambiguous. Three different
/// Background Assets events all say "Asset Pack", so the description opens by
/// saying which one.
const CONTEXT: Partial<Record<AppStoreWebhookEventType, string>> = {
  BACKGROUND_ASSET_VERSION_APP_STORE_RELEASE_STATE_UPDATED:
    "App Store release of the asset pack.",
  BACKGROUND_ASSET_VERSION_EXTERNAL_BETA_RELEASE_STATE_UPDATED:
    "External TestFlight release of the asset pack.",
  BACKGROUND_ASSET_VERSION_INTERNAL_BETA_RELEASE_CREATED:
    "A new internal TestFlight release of the asset pack was created.",
  BETA_FEEDBACK_CRASH_SUBMISSION_CREATED:
    "A tester's build crashed and TestFlight captured a report.",
  BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED:
    "A tester sent feedback with a screenshot.",
  ALTERNATIVE_DISTRIBUTION_PACKAGE_VERSION_CREATED:
    "A new alternative distribution package version was created.",
};

/// What a state actually means, in one line, for whoever is reading this at
/// 1am and does not have App Store Connect open. States not listed here get no
/// line rather than a vague one.
const STATE_MEANING: Record<string, string> = {
  PREPARE_FOR_SUBMISSION: "Still being prepared. Nothing is with Apple yet.",
  READY_FOR_REVIEW: "Everything is filled in. It still needs to be submitted.",
  WAITING_FOR_REVIEW: "Submitted. Waiting for a reviewer to pick it up.",
  IN_REVIEW: "A reviewer at Apple is looking at it now.",
  PENDING_DEVELOPER_RELEASE: "Approved. It goes live when you release it.",
  PENDING_APPLE_RELEASE: "Approved. Apple releases it on the scheduled date.",
  PENDING_CONTRACT: "Approved, but a contract or agreement is blocking release.",
  READY_FOR_DISTRIBUTION: "Live on the App Store.",
  PROCESSING_FOR_DISTRIBUTION: "Apple is preparing it for distribution.",
  DEVELOPER_REJECTED: "Pulled out of review from your side.",
  REJECTED: "Apple rejected it. Check Resolution Center.",
  METADATA_REJECTED: "Rejected over metadata. The binary is fine.",
  INVALID_BINARY: "The binary was rejected. A new build is needed.",
  WAITING_FOR_EXPORT_COMPLIANCE: "Waiting on export compliance answers.",
  MISSING_EXPORT_COMPLIANCE: "Export compliance information is missing.",
  PROCESSING: "Apple is processing the upload.",
  COMPLETE: "Processing finished cleanly.",
  FAILED: "Processing failed.",
  PROCESSING_EXCEPTION: "Processing failed.",
  AWAITING_UPLOAD: "Waiting for the upload to arrive.",
  READY_FOR_BETA_SUBMISSION: "Ready to submit for beta review.",
  WAITING_FOR_BETA_REVIEW: "Submitted for beta review.",
  IN_BETA_REVIEW: "Beta review is in progress.",
  BETA_REJECTED: "Beta review rejected the build.",
  BETA_APPROVED: "Beta review approved the build.",
  READY_FOR_BETA_TESTING: "External testers can install it now.",
  IN_BETA_TESTING: "External testers are on it.",
  EXPIRED: "The build expired and can no longer be installed.",
  DEVELOPER_REMOVED_FROM_SALE: "Removed from sale.",
  REPLACED_WITH_NEW_VERSION: "Superseded by a newer version.",
};

/// The happy path through each pipeline, so the embed can say how far along
/// this is. Only the states on the path are listed; a rejection or a failure
/// falls off it and gets no bar, which is the honest answer, since "stage 3 of
/// 6" would imply progress that is not happening.
const STAGES: Partial<Record<AppStoreWebhookEventType, string[]>> = {
  APP_STORE_VERSION_APP_VERSION_STATE_UPDATED: [
    "PREPARE_FOR_SUBMISSION",
    "READY_FOR_REVIEW",
    "WAITING_FOR_REVIEW",
    "IN_REVIEW",
    "PENDING_DEVELOPER_RELEASE",
    "READY_FOR_DISTRIBUTION",
  ],
  BUILD_UPLOAD_STATE_UPDATED: ["AWAITING_UPLOAD", "PROCESSING", "COMPLETE"],
  BUILD_BETA_DETAIL_EXTERNAL_BUILD_STATE_UPDATED: [
    "PROCESSING",
    "READY_FOR_BETA_SUBMISSION",
    "WAITING_FOR_BETA_REVIEW",
    "IN_BETA_REVIEW",
    "READY_FOR_BETA_TESTING",
    "IN_BETA_TESTING",
  ],
  BACKGROUND_ASSET_VERSION_STATE_UPDATED: [
    "AWAITING_UPLOAD",
    "PROCESSING",
    "COMPLETE",
  ],
};

/// States that sit in the same slot as one already on the path. Apple has
/// several names for "approved, not out yet".
const STAGE_ALIASES: Record<string, string> = {
  PENDING_APPLE_RELEASE: "PENDING_DEVELOPER_RELEASE",
  PENDING_CONTRACT: "PENDING_DEVELOPER_RELEASE",
  PROCESSING_FOR_DISTRIBUTION: "PENDING_DEVELOPER_RELEASE",
  ACCEPTED: "READY_FOR_DISTRIBUTION",
  READY_FOR_SALE: "READY_FOR_DISTRIBUTION",
  WAITING_FOR_EXPORT_COMPLIANCE: "READY_FOR_REVIEW",
  BETA_APPROVED: "READY_FOR_BETA_TESTING",
};

export interface AppStoreEmbedConfig {
  /// What to call the app in the embed. Apple's payloads never say.
  appName?: string | null;
  /// The numeric App Store Connect app id, used to make the title clickable.
  appStoreConnectAppId?: string | null;
  /// Overrides the "App Store Connect" webhook display name in Discord.
  username?: string | null;
  /// The avatar Discord shows next to the message, and the small icon on the
  /// author line.
  avatarUrl?: string | null;
}

/// The most specific App Store Connect page we can reach without guessing at
/// URL shapes that move. Version and build ids from the payload are API ids,
/// not the ids the web console uses, so we stop at the app.
function consoleUrl(
  event: NormalizedAppStoreEvent,
  appId: string | null | undefined
): string | undefined {
  if (!appId) return undefined;
  const base = `https://appstoreconnect.apple.com/apps/${appId}`;
  switch (event.eventType) {
    case "BETA_FEEDBACK_CRASH_SUBMISSION_CREATED":
    case "BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED":
    case "BUILD_BETA_DETAIL_EXTERNAL_BUILD_STATE_UPDATED":
    case "BACKGROUND_ASSET_VERSION_EXTERNAL_BETA_RELEASE_STATE_UPDATED":
    case "BACKGROUND_ASSET_VERSION_INTERNAL_BETA_RELEASE_CREATED":
      return `${base}/testflight`;
    case "APP_STORE_VERSION_APP_VERSION_STATE_UPDATED":
    case "BACKGROUND_ASSET_VERSION_APP_STORE_RELEASE_STATE_UPDATED":
      return `${base}/distribution`;
    default:
      return base;
  }
}

/// `▰▰▰▱▱▱  Stage 3 of 6`, or nothing when this state is not on the happy path.
export function stageBar(
  eventType: AppStoreWebhookEventType | null,
  rawNewState: string | null
): string | null {
  if (!eventType || !rawNewState) return null;
  const path = STAGES[eventType];
  if (!path) return null;

  const key = rawNewState.toUpperCase();
  const canonical = STAGE_ALIASES[key] ?? key;
  const index = path.indexOf(canonical);
  if (index < 0) return null;

  const filled = index + 1;
  const bar = "▰".repeat(filled) + "▱".repeat(path.length - filled);
  return `${bar}  Stage ${filled} of ${path.length}`;
}

/// The headline half of the title. Specific enough to stand alone in a push
/// notification.
function headline(event: NormalizedAppStoreEvent): string {
  if (event.ping) return "Test ping";
  switch (event.eventType) {
    case "BETA_FEEDBACK_CRASH_SUBMISSION_CREATED":
      return "New crash report";
    case "BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED":
      return "New tester feedback";
    case "BACKGROUND_ASSET_VERSION_INTERNAL_BETA_RELEASE_CREATED":
      return "Internal release created";
    case "ALTERNATIVE_DISTRIBUTION_PACKAGE_VERSION_CREATED":
      return "Package version created";
    default:
      break;
  }
  if (event.newState) return event.newState;
  return event.eventType ? "Updated" : event.rawType;
}

function emojiFor(event: NormalizedAppStoreEvent): string {
  if (event.ping) return "📡";
  if (event.eventType === "BETA_FEEDBACK_CRASH_SUBMISSION_CREATED") return "🚨";
  if (event.rawNewState) {
    const specific = STATE_EMOJI[event.rawNewState.toUpperCase()];
    if (specific) return specific;
  }
  return TONE_EMOJI[event.tone];
}

/// The body. One line of plain English, then the transition, then how far along
/// it is. Discord's `-#` prefix renders the stage bar as small grey subtext,
/// which is exactly the weight it deserves.
function describe(event: NormalizedAppStoreEvent): string {
  const lines: string[] = [];

  if (event.ping) {
    lines.push(
      "App Store Connect delivered a test ping. The relay is wired up correctly."
    );
    return lines.join("\n");
  }

  const context = event.eventType ? CONTEXT[event.eventType] : undefined;
  const meaning = event.rawNewState
    ? STATE_MEANING[event.rawNewState.toUpperCase()]
    : undefined;

  if (context) lines.push(context);
  if (meaning) lines.push(meaning);
  if (!lines.length) lines.push("App Store Connect reported a change.");

  if (event.oldState && event.newState) {
    lines.push("", `\`${event.oldState}\`  →  **${event.newState}**`);
  } else if (event.newState) {
    lines.push("", `**${event.newState}**`);
  }

  const bar = stageBar(event.eventType, event.rawNewState);
  if (bar) lines.push(`-# ${bar}`);

  return lines.join("\n");
}

/// Build the embed for one event.
export function buildAppStoreEmbed(
  event: NormalizedAppStoreEvent,
  config: AppStoreEmbedConfig = {}
): DiscordEmbed {
  const url = consoleUrl(event, config.appStoreConnectAppId);
  const pipeline = event.eventType
    ? PIPELINES[event.eventType]
    : event.ping
      ? "Webhook"
      : "App Store Connect";

  const fields = event.details.map((detail) => ({
    name: detail.label,
    value: detail.value,
    inline: detail.inline ?? false,
  }));

  // The API handle for whatever changed. Grey, at the bottom, because it is
  // only useful when something has gone wrong and you are about to go look it
  // up with the App Store Connect API.
  const footerParts: string[] = [];
  if (event.eventType) footerParts.push(event.eventType);
  else if (event.rawType !== "unknown") footerParts.push(event.rawType);
  if (event.instance?.id) footerParts.push(event.instance.id);

  const embed: DiscordEmbed = {
    title: `${emojiFor(event)}  ${pipeline}: ${headline(event)}`,
    description: describe(event),
    color: TONE_COLORS[event.tone],
    fields,
    timestamp: (event.timestamp ?? new Date()).toISOString(),
  };

  if (url) embed.url = url;
  if (config.appName) {
    embed.author = {
      name: config.appName,
      ...(url ? { url } : {}),
      ...(config.avatarUrl ? { icon_url: config.avatarUrl } : {}),
    };
  }
  if (footerParts.length) embed.footer = { text: footerParts.join("  ·  ") };

  return embed;
}

/// The full webhook body, ready to POST.
export function buildAppStoreDiscordMessage(
  event: NormalizedAppStoreEvent,
  config: AppStoreEmbedConfig = {}
): DiscordMessage {
  return {
    username: config.username || "App Store Connect",
    avatar_url: config.avatarUrl || undefined,
    embeds: [buildAppStoreEmbed(event, config)],
  };
}

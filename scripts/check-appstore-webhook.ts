// scripts/check-appstore-webhook.ts
// Offline proof that the relay reads Apple correctly and hands Discord
// something valid. No network, no database: the payloads below are Apple's own
// documented examples, and the HMAC vector is the one in Apple's setup guide.
//
//   npm run check:appstore
import {
  normalizeAppStoreEvent,
  verifyAppStoreSignature,
  labelForState,
  toneForState,
  APP_STORE_WEBHOOK_EVENT_TYPES,
} from "@/lib/appstore/webhookEvents";
import { buildAppStoreDiscordMessage, stageBar } from "@/lib/appstore/discordEmbed";
import { clampDiscordMessage } from "@/lib/discordWebhook";
import crypto from "crypto";

let pass = 0,
  fail = 0;
function check(name: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${name}${
      ok ? "" : `\n          got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`
    }`
  );
  ok ? pass++ : fail++;
}

console.log("\nthe signature Apple documents");
// From "Configuring and parsing App Store Connect API webhook notifications":
// HMAC-SHA256 of "Hello, World!" under "This is my secret".
const APPLE_VECTOR =
  "7f062172b01cb00b53ca068614674a3d982a34062a0f5d37687d5e3377e54657";
check(
  "Apple's worked example verifies",
  verifyAppStoreSignature("Hello, World!", `hmacsha256=${APPLE_VECTOR}`, "This is my secret"),
  true
);
check(
  "a bare hex digest is accepted too",
  verifyAppStoreSignature("Hello, World!", APPLE_VECTOR, "This is my secret"),
  true
);
check(
  "the wrong secret is refused",
  verifyAppStoreSignature("Hello, World!", `hmacsha256=${APPLE_VECTOR}`, "not my secret"),
  false
);
check(
  "a tampered body is refused",
  verifyAppStoreSignature("Hello, World?", `hmacsha256=${APPLE_VECTOR}`, "This is my secret"),
  false
);
check(
  "a missing header is refused",
  verifyAppStoreSignature("Hello, World!", null, "This is my secret"),
  false
);
check(
  "a truncated signature is refused rather than throwing",
  verifyAppStoreSignature("Hello, World!", "hmacsha256=7f06", "This is my secret"),
  false
);

console.log("\nstate names read as English");
check("known states use Apple's wording", labelForState("PREPARE_FOR_SUBMISSION"), "Prepare for Submission");
check("beta testing is plain", labelForState("READY_FOR_BETA_TESTING"), "Ready to Test");
check("unknown states still title-case", labelForState("SOME_FUTURE_STATE"), "Some Future State");

console.log("\ntone survives states we have never seen");
check("FAILED is bad", toneForState("FAILED"), "bad");
check("DEVELOPER_REJECTED is bad", toneForState("DEVELOPER_REJECTED"), "bad");
check("MISSING_EXPORT_COMPLIANCE is bad", toneForState("MISSING_EXPORT_COMPLIANCE"), "bad");
check("WAITING_FOR_EXPORT_COMPLIANCE is only slow", toneForState("WAITING_FOR_EXPORT_COMPLIANCE"), "working");
check("COMPLETE is good", toneForState("COMPLETE"), "good");
check("READY_FOR_DISTRIBUTION is good", toneForState("READY_FOR_DISTRIBUTION"), "good");
check("IN_REVIEW is a person holding it", toneForState("IN_REVIEW"), "review");
check("PENDING_DEVELOPER_RELEASE is a person holding it", toneForState("PENDING_DEVELOPER_RELEASE"), "review");
check("PROCESSING is only a machine", toneForState("PROCESSING"), "working");
check("READY_FOR_REVIEW is not yet Apple's problem", toneForState("READY_FOR_REVIEW"), "neutral");
check("PREPARE_FOR_SUBMISSION is neutral", toneForState("PREPARE_FOR_SUBMISSION"), "neutral");

console.log("\nApple's documented payloads");

const appVersion = normalizeAppStoreEvent({
  data: {
    type: "appStoreVersionAppVersionStateUpdated",
    id: "7c813492-9516-4c79-903e-224effdd57ac",
    version: 1,
    attributes: {
      newValue: "READY_FOR_REVIEW",
      oldValue: "PREPARE_FOR_SUBMISSION",
      timestamp: "2025-04-16T05:00:52.745Z",
    },
    relationships: {
      instance: { data: { type: "appStoreVersions", id: "ad7e6298-2570-4ca6-b3cc-f81788e40bdc" } },
    },
  },
});
check("app version maps to its config event type", appVersion.eventType, "APP_STORE_VERSION_APP_VERSION_STATE_UPDATED");
check("app version reads newValue/oldValue", [appVersion.oldState, appVersion.newState], ["Prepare for Submission", "Ready for Review"]);
check("app version finds the instance", appVersion.instance?.id, "ad7e6298-2570-4ca6-b3cc-f81788e40bdc");
check("app version keeps Apple's timestamp", appVersion.timestamp?.toISOString(), "2025-04-16T05:00:52.745Z");

const betaBuild = normalizeAppStoreEvent({
  data: {
    type: "buildBetaDetailExternalBuildStateUpdated",
    id: "4a9eacca-e53f-4006-85db-aa18c515663a",
    version: 1,
    attributes: {
      newExternalBuildState: "READY_FOR_BETA_TESTING",
      oldExternalBuildState: "IN_BETA_REVIEW",
      timestamp: "2025-04-16T05:00:52.745Z",
    },
    relationships: {
      instance: { data: { type: "buildBetaDetails", id: "ad7e6298-2570-4ca6-b3cc-f81788e40bdc" } },
    },
  },
});
check("TestFlight build reads its own attribute names", [betaBuild.oldState, betaBuild.newState], ["In Beta Review", "Ready to Test"]);
check("a build that went live is good news", betaBuild.tone, "good");

const upload = normalizeAppStoreEvent({
  data: {
    type: "buildUploadStateUpdated",
    id: "7c813492-9516-4c79-903e-224effdd57ac",
    version: 1,
    attributes: { oldState: "PROCESSING", newState: "FAILED" },
    relationships: {
      instance: { data: { type: "buildUploads", id: "ad7e6298-2570-4ca6-b3cc-f81788e40bdc" } },
    },
  },
});
check("a failed upload is bad news", upload.tone, "bad");
check("an event without a timestamp does not invent one", upload.timestamp, null);

const crash = normalizeAppStoreEvent({
  data: {
    type: "betaFeedbackCrashSubmissionCreated",
    id: "a4319bc8-ed16-460b-8de6-ba9734b55631",
    version: 1,
    attributes: { timestamp: "2025-05-16T20:53:20.729Z" },
    relationships: {
      instance: {
        data: { type: "betaFeedbackCrashSubmissions", id: "AK7UjG-qL5QxXf3gIOGjbpQ" },
        links: { self: "https://api.appstoreconnect.apple.com/v1/betaFeedbackCrashSubmissions/AK7UjG-qL5QxXf3gIOGjbpQ" },
      },
    },
  },
});
check("a crash report has no transition", [crash.oldState, crash.newState], [null, null]);
check("a crash report still reads as urgent", crash.tone, "bad");
check("a screenshot submission is informational", normalizeAppStoreEvent({ data: { type: "betaFeedbackScreenshotSubmissionCreated", attributes: { timestamp: "2025-05-08T01:29:36.16Z" } } }).tone, "info");

// Background Assets put the id and type directly on `instance`, not under
// `instance.data`. Apple's own examples disagree with each other here.
const assetPack = normalizeAppStoreEvent({
  data: {
    type: "backgroundAssetVersionStateUpdated",
    id: "cd7e273b-0514-4bf6-9ccb-30449a7d03e4",
    attributes: { timestamp: "2025-12-08T14:30:45Z", newState: "FAILED", oldState: "PROCESSING" },
    relationships: {
      instance: {
        id: "607fea97-a6ba-445d-a9bd",
        type: "backgroundAssetVersions",
        links: { self: "https://api.appstoreconnect.apple.com/v1/backgroundAssetVersions/607fea97-a6ba-445d-a9bd" },
      },
    },
  },
});
check("the flat instance shape is read too", assetPack.instance?.id, "607fea97-a6ba-445d-a9bd");
check("the flat instance keeps its type", assetPack.instance?.type, "backgroundAssetVersions");

const marketplace = normalizeAppStoreEvent({
  data: {
    type: "alternativeDistributionPackageAvailableUpdated",
    id: "da44e419-437b-4dbe-894c-2da570ffc4d1",
    version: 1,
    attributes: { available: true, territories: ["DNK", "IRL", "NLD"], appId: "10795428705", timestamp: "2025-07-10T22:35:02.541411Z" },
  },
});
check("availability is surfaced", marketplace.details.find((d) => d.label === "Available")?.value, "Yes");
check("territories are counted in the label", marketplace.details.find((d) => d.label.startsWith("Territories"))?.label, "Territories (3)");

console.log("\nnothing is dropped on the floor");
const unknown = normalizeAppStoreEvent({ data: { type: "somethingAppleShippedToday", id: "x" } });
check("an unknown type has no config mapping", unknown.eventType, null);
check("an unknown type still gets a title", unknown.title, "App Store Connect event: somethingAppleShippedToday");
const empty = normalizeAppStoreEvent(null);
check("an empty body does not throw", empty.rawType, "unknown");
check("a ping is recognised", normalizeAppStoreEvent({ data: { type: "webhookPings", id: "p" } }).ping, true);

console.log("\nevery event type in the App Store Connect dialog is mapped");
for (const eventType of APP_STORE_WEBHOOK_EVENT_TYPES) {
  const camel = eventType
    .toLowerCase()
    .split("_")
    .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join("");
  const normalized = normalizeAppStoreEvent({ data: { type: camel, id: "id", attributes: { newState: "COMPLETE" } } });
  check(`${eventType} round-trips`, normalized.eventType, eventType);
}

console.log("\nthe embed Discord will accept");
const message = buildAppStoreDiscordMessage(appVersion, {
  appName: "Theta Tau",
  appStoreConnectAppId: "1234567890",
  avatarUrl: "https://example.com/icon.png",
});
const embed = message.embeds![0];
// READY_FOR_REVIEW is not progress, it just means the form is filled in, so it
// stays grey rather than borrowing the indigo that "In Review" earns.
check("the title names the pipeline and the news", embed.title, "⚪  App Store: Ready for Review");
check("the colour is the neutral grey", embed.color, 0x8e8e93);
check("the author line is the app, with its icon", [embed.author?.name, embed.author?.icon_url], ["Theta Tau", "https://example.com/icon.png"]);
check("the description explains the state in English", embed.description?.split("\n")[0], "Everything is filled in. It still needs to be submitted.");
check("the transition is rendered as a transition", embed.description?.includes("`Prepare for Submission`  →  **Ready for Review**"), true);
check("the stage bar rides along as subtext", embed.description?.includes("-# ▰▰▱▱▱▱  Stage 2 of 6"), true);
check("the title links into App Store Connect", embed.url, "https://appstoreconnect.apple.com/apps/1234567890/distribution");
check("the footer carries the handles you would debug with", embed.footer?.text, "APP_STORE_VERSION_APP_VERSION_STATE_UPDATED  ·  ad7e6298-2570-4ca6-b3cc-f81788e40bdc");
check("TestFlight events link to TestFlight", buildAppStoreDiscordMessage(crash, { appStoreConnectAppId: "1234567890" }).embeds![0].url, "https://appstoreconnect.apple.com/apps/1234567890/testflight");
check("no app id means no dead link", buildAppStoreDiscordMessage(crash, {}).embeds![0].url, undefined);

console.log("\ntitles stand alone in a notification preview");
const titleOf = (e: any) => buildAppStoreDiscordMessage(e, {}).embeds![0].title;
check("a crash names TestFlight", titleOf(crash), "🚨  TestFlight: New crash report");
check("a failed upload names the upload", titleOf(upload), "💥  Build Upload: Failed");
check("a live build gets the rocket", titleOf(betaBuild), "🚀  TestFlight: Ready to Test");
check("a ping is unmistakably a ping", titleOf(normalizeAppStoreEvent({ data: { type: "webhookPings", id: "p" } })), "📡  Webhook: Test ping");
check("an unknown type still says something", titleOf(unknown), "⚪  App Store Connect: somethingAppleShippedToday");

console.log("\nthe stage bar only claims progress that is real");
check("in review is stage 4 of 6", stageBar("APP_STORE_VERSION_APP_VERSION_STATE_UPDATED", "IN_REVIEW"), "▰▰▰▰▱▱  Stage 4 of 6");
check("live is the last stage", stageBar("APP_STORE_VERSION_APP_VERSION_STATE_UPDATED", "READY_FOR_DISTRIBUTION"), "▰▰▰▰▰▰  Stage 6 of 6");
check("an Apple-scheduled release shares the developer-release slot", stageBar("APP_STORE_VERSION_APP_VERSION_STATE_UPDATED", "PENDING_APPLE_RELEASE"), "▰▰▰▰▰▱  Stage 5 of 6");
check("a rejection has fallen off the path, so no bar", stageBar("APP_STORE_VERSION_APP_VERSION_STATE_UPDATED", "DEVELOPER_REJECTED"), null);
check("a failed upload gets no bar either", stageBar("BUILD_UPLOAD_STATE_UPDATED", "FAILED"), null);
check("events without a pipeline get no bar", stageBar("BETA_FEEDBACK_CRASH_SUBMISSION_CREATED", null), null);

const huge = buildAppStoreDiscordMessage(
  normalizeAppStoreEvent({
    data: {
      type: "alternativeDistributionPackageAvailableUpdated",
      id: "big",
      attributes: { available: true, territories: Array.from({ length: 400 }, (_, i) => `T${i}`), timestamp: "2025-07-10T22:35:02.541Z" },
    },
  }),
  { appName: "Theta Tau" }
);
const clamped = clampDiscordMessage(huge);
const longest = Math.max(...clamped.embeds![0].fields!.map((f) => f.value.length));
check("a 400-territory rollout stays inside Discord's field limit", longest <= 1024, true);
const totalChars = JSON.stringify(clamped.embeds![0]).length;
check("and inside the 6000-character embed budget", totalChars <= 6000, true);

console.log("\nwhat the route would reject");
const secret = "webhook-secret";
const body = JSON.stringify({ data: { type: "buildUploadStateUpdated" } });
const good = `hmacsha256=${crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
check("a body signed with our secret passes", verifyAppStoreSignature(body, good, secret), true);
check("the same signature over a re-serialised body fails", verifyAppStoreSignature(JSON.stringify(JSON.parse(body), null, 2), good, secret), false);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);

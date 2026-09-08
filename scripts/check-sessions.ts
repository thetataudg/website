// scripts/check-sessions.ts
// Exercises the admin sessions reader against the configured Clerk instance.
//
// Two halves: the device classifier is checked against fixed user agents (no
// network), then the live listing runs so a broken credential or a changed
// response shape fails here rather than in the admin console.
//
//   npm run check:sessions
import {
  classifyActivity,
  describeActivity,
  listActiveSessions,
} from "../lib/clerkSessions";
import { classifyUserAgent, appVersionFromUserAgent } from "../lib/presence";

let failures = 0;

function expect(label: string, actual: unknown, wanted: unknown) {
  const ok = actual === wanted;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} → ${String(actual)}${ok ? "" : ` (wanted ${String(wanted)})`}`);
}

// The user agent URLSession sends for the app's own API calls.
const APP_UA = "Theta Tau/14 CFNetwork/3826.500.111.2.2 Darwin/24.4.0";
// What the Clerk iOS SDK sends, per TTDGUserAgentMiddleware.
const CLERK_APP_UA = "TTDG-Mobile-App/1.4";
const SAFARI_IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

console.log("— user agent classification —");
expect("native app (URLSession)", classifyUserAgent(APP_UA), "ios");
expect("native app (Clerk SDK)", classifyUserAgent(CLERK_APP_UA), "ios");
// The distinction that makes the number mean anything: Safari on a phone is
// the website, not the app.
expect("Safari on iPhone is web", classifyUserAgent(SAFARI_IPHONE_UA), "web");
expect("Chrome on Windows is web", classifyUserAgent(CHROME_UA), "web");
expect("empty agent", classifyUserAgent(""), "unknown");
expect("app build from URLSession agent", appVersionFromUserAgent(APP_UA), "14");
expect("app build from Clerk agent", appVersionFromUserAgent(CLERK_APP_UA), "1.4");

// Clerk's own view of a session, as the dashboard renders it. The native app
// arrives with no device type and the percent-encoded bundle name where a
// browser would be; a real browser fills both in.
const APP_ACTIVITY = {
  browser_name: "Theta%20Tau",
  browser_version: "14",
  device_type: null,
  is_mobile: true,
  city: "Phoenix",
  country: "United States",
};
const WEB_ACTIVITY = {
  browser_name: "Chrome",
  browser_version: "152.0.0.0",
  device_type: "Windows",
  is_mobile: false,
  city: "Tempe",
  country: "United States",
};

console.log("\n— Clerk session classification —");
expect("app session", classifyActivity(APP_ACTIVITY), "ios");
expect("web session", classifyActivity(WEB_ACTIVITY), "web");
expect("empty activity", classifyActivity({}), "unknown");
expect(
  "app label",
  describeActivity(APP_ACTIVITY, "ios"),
  "iPhone app (build 14)"
);
expect(
  "web label",
  describeActivity(WEB_ACTIVITY, "web"),
  "Chrome 152 on Windows"
);

async function liveRead() {
  console.log("\n— live Clerk read —");
  try {
    const started = Date.now();
    const sessions = await listActiveSessions();
    console.log(
      `ok   listed ${sessions.length} active session(s) in ${Date.now() - started}ms`
    );
    for (const session of sessions.slice(0, 20)) {
      console.log(
        `     ${session.platform.padEnd(7)} ${session.deviceLabel} — ${
          session.location || session.ipAddress || "no location"
        } — ${session.lastActiveAt ?? "never"}`
      );
    }
    const counts = sessions.reduce<Record<string, number>>((acc, s) => {
      acc[s.platform] = (acc[s.platform] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`     by platform: ${JSON.stringify(counts)}`);
  } catch (err: any) {
    failures++;
    console.log(`FAIL live read → ${err?.message ?? err}`);
  }
}

liveRead().then(() => {
  console.log(
    failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`
  );
  process.exit(failures === 0 ? 0 : 1);
});

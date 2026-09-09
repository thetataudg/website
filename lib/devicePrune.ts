// lib/devicePrune.ts
// Retiring push tokens nobody is behind any more.
//
// This is the last of three layers, and deliberately the weakest one. The other
// two do most of the work:
//
//   - APNs itself. A token refused by both gateways is disabled on the spot by
//     `lib/notify/channels/push.ts`. That is the authoritative signal, because
//     Apple is the only party that actually knows a token is dead.
//   - Sign-out. The app disables its own token on the way out, so a handset
//     handed to next year's treasurer stops carrying the last one's alerts.
//
// What neither catches is the token that is still *valid* and no longer
// *wanted*: an app deleted without signing out, a phone replaced, a member who
// stopped opening the app. Apple keeps accepting those for a while and nobody
// ever tells us. That is the gap this closes.
//
// Worth knowing why the pile got large in the first place: push had been
// failing at the provider-token stage since the APNs key was stored with quotes
// around it, so no send ever reached Apple, so the self-healing layer above
// never ran once. Most of a backlog like that clears itself on the first
// working send; this sweep is for the remainder.
import DeviceToken from "@/lib/models/DeviceToken";
import logger from "@/lib/logger";

/// How long a token may go unheard-from before it is presumed dead.
///
/// `lastSeenAt` is bumped by two things: the app re-registering, which it does
/// on every foreground, and a push Apple accepted. So the clock only runs on a
/// device that is neither being opened nor being successfully pushed to, and 90
/// days of both at once is a phone that is gone.
///
/// Deliberately generous. A member who does not open the app for a season still
/// wants to hear that dues are due, and push is the only way left to tell them
/// — disabling a live token to tidy a table would cost exactly the person the
/// reminder was for. The cost of waiting is one wasted round trip to Apple per
/// send; the cost of being wrong is silence.
export const DEVICE_STALE_DAYS = 90;

export interface DevicePruneReport {
  /// Tokens retired by this run.
  disabled: number;
  /// Tokens still live afterwards, for the log to show the sweep in proportion.
  remaining: number;
}

/// Disable every enabled token that has gone quiet for too long.
///
/// Reversible by design, and that is what makes it safe to run unattended: the
/// row is disabled rather than deleted, and `POST /api/devices` clears
/// `disabledAt` on the next registration. A phone that was merely asleep for
/// three months comes back the first time somebody opens the app.
export async function pruneDeviceTokens(
  now = new Date()
): Promise<DevicePruneReport> {
  try {
    const cutoff = new Date(now.getTime() - DEVICE_STALE_DAYS * 24 * 3600_000);

    const result = await DeviceToken.updateMany(
      {
        disabledAt: null,
        // A row with no `lastSeenAt` at all predates the field. Left alone
        // rather than swept: "we never recorded this" is not evidence that the
        // device is gone, and the schema defaults it for everything written
        // since, so the case empties itself.
        lastSeenAt: { $ne: null, $lt: cutoff },
      },
      {
        $set: {
          disabledAt: now,
          disabledReason: `not seen in ${DEVICE_STALE_DAYS} days`,
        },
      }
    );

    const disabled = result.modifiedCount ?? 0;
    const remaining = await DeviceToken.countDocuments({ disabledAt: null });

    if (disabled > 0) {
      logger.info({ disabled, remaining, cutoff }, "Retired stale device tokens");
    }
    return { disabled, remaining };
  } catch (err: any) {
    // Never fails the cron. Tidying the device table is the least important
    // thing the nightly job does, and a sweep that throws must not cost the
    // chapter its dues reminders.
    logger.warn({ err }, "Device token sweep failed");
    return { disabled: 0, remaining: 0 };
  }
}

// lib/notify/channels/push.ts
// APNs, over HTTP/2 with a token-based (.p8) auth key.
//
// Written against `node:http2` and `node:crypto` rather than a push library.
// APNs requires HTTP/2, which `fetch` won't do, and the auth is a three-field
// ES256 JWT — so a dependency here would be wrapping about forty lines of
// standard library. The provider token is cached because Apple rejects clients
// that mint a new one on every send.
import http2 from "node:http2";
import crypto from "node:crypto";
import DeviceToken from "@/lib/models/DeviceToken";
import logger from "@/lib/logger";
import type { Channel, DeliveryRequest, DeliveryResult } from "./types";

const TEAM_ID = process.env.APNS_TEAM_ID || "WVQ9Z7S7RR";
const BUNDLE_ID = process.env.APNS_BUNDLE_ID || "org.thetatau.dg.ThetaTau";
/// A provider token is good for an hour and must not be regenerated more often
/// than every 20 minutes, so it's minted at most once every 45.
const TOKEN_TTL_MS = 45 * 60 * 1000;

let cachedToken: { value: string; mintedAt: number } | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/// The .p8 file, either inline in the env var or with its newlines escaped —
/// which is what happens to it in every hosting dashboard on earth.
function privateKey(): string | null {
  const raw = process.env.APNS_KEY_P8;
  if (!raw) return null;
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function providerToken(): string | null {
  const key = privateKey();
  const keyId = process.env.APNS_KEY_ID;
  if (!key || !keyId) return null;

  if (cachedToken && Date.now() - cachedToken.mintedAt < TOKEN_TTL_MS) {
    return cachedToken.value;
  }

  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64url(
    JSON.stringify({ iss: TEAM_ID, iat: Math.floor(Date.now() / 1000) })
  );
  try {
    // ECDSA signatures come out DER-encoded by default; JWT wants the raw
    // r||s pair. Getting this wrong produces a token Apple rejects with a
    // maddeningly generic InvalidProviderToken.
    const signature = crypto.sign(
      null,
      Buffer.from(`${header}.${payload}`),
      { key, dsaEncoding: "ieee-p1363" }
    );
    const token = `${header}.${payload}.${base64url(signature)}`;
    cachedToken = { value: token, mintedAt: Date.now() };
    return token;
  } catch (err: any) {
    logger.error({ err }, "APNS_KEY_P8 could not be used to sign a provider token");
    return null;
  }
}

const PRODUCTION_GATEWAY = "https://api.push.apple.com";
const SANDBOX_GATEWAY = "https://api.sandbox.push.apple.com";

/// Production unless the device explicitly said sandbox.
///
/// Production is the default rather than "development" because that is what
/// every shipped build is, and an unrecognised or missing value should fail
/// toward the case that covers the chapter rather than toward the one that
/// covers a laptop.
function gatewayFor(environment: string): string {
  return environment === "development" ? SANDBOX_GATEWAY : PRODUCTION_GATEWAY;
}

function otherGateway(gateway: string): string {
  return gateway === PRODUCTION_GATEWAY ? SANDBOX_GATEWAY : PRODUCTION_GATEWAY;
}

function environmentFor(gateway: string): string {
  return gateway === PRODUCTION_GATEWAY ? "production" : "development";
}

/// Whether APNs is saying "wrong gateway" rather than "dead device".
///
/// It says both with the same words. A token minted against the sandbox and
/// presented to the production gateway comes back `BadDeviceToken`, and so
/// does a token that has genuinely been revoked; `Unregistered`/410 likewise
/// means "not valid *here*", not "not valid anywhere". The two are only
/// distinguishable by trying the other gateway, which is exactly what the
/// caller now does before writing the device off.
function looksLikeWrongGateway(attempt: ApnsAttempt): boolean {
  return (
    attempt.status === 400 ||
    attempt.status === 410 ||
    attempt.reason === "BadDeviceToken" ||
    attempt.reason === "Unregistered"
  );
}

interface ApnsAttempt {
  status: number;
  reason: string;
}

function sendOne(
  gateway: string,
  deviceToken: string,
  jwt: string,
  payload: unknown
): Promise<ApnsAttempt> {
  return new Promise((resolve) => {
    const client = http2.connect(gateway);
    const settle = (result: ApnsAttempt) => {
      client.close();
      resolve(result);
    };
    client.on("error", (err) => {
      logger.warn({ err, gateway }, "APNs connection failed");
      resolve({ status: 0, reason: "connection failed" });
    });

    const body = Buffer.from(JSON.stringify(payload));
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": BUNDLE_ID,
      "apns-push-type": "alert",
      "content-type": "application/json",
      "content-length": body.length,
    });

    let status = 0;
    let raw = "";
    request.setEncoding("utf8");
    request.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("error", () => settle({ status: 0, reason: "stream error" }));
    request.on("end", () => {
      let reason = "";
      try {
        reason = raw ? JSON.parse(raw)?.reason ?? "" : "";
      } catch {
        reason = raw.slice(0, 120);
      }
      settle({ status, reason });
    });
    request.setTimeout(10_000, () => settle({ status: 0, reason: "timeout" }));
    request.end(body);
  });
}

export const pushChannel: Channel = {
  name: "push",

  isConfigured() {
    return Boolean(process.env.APNS_KEY_P8 && process.env.APNS_KEY_ID);
  },

  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    if (!this.isConfigured()) {
      return { channel: "push", delivered: false, skipped: "not configured" };
    }
    const jwt = providerToken();
    if (!jwt) {
      return { channel: "push", delivered: false, skipped: "no provider token" };
    }

    const devices = await DeviceToken.find({
      memberId: request.recipient.memberId,
      disabledAt: null,
    }).lean<any[]>();
    if (!devices.length) {
      return { channel: "push", delivered: false, skipped: "no registered device" };
    }

    const payload = {
      aps: {
        alert: {
          title: request.message.title,
          body: request.message.push,
        },
        sound: "default",
        // The bell badge is the member's unread count, which the pipeline
        // doesn't know here — the app recomputes it on foreground.
        "thread-id": request.message.category,
        // "active" is the default and is what everything else here sends.
        // Time-sensitive breaks through Focus and survives an hour on the lock
        // screen; it needs the matching entitlement in the app, which the
        // Theta Tau target carries.
        "interruption-level": request.timeSensitive ? "time-sensitive" : "active",
      },
      link: request.message.link,
      template: request.template,
    };

    let anyDelivered = false;
    for (const device of devices) {
      // Try what the device told us at registration, then the other gateway if
      // that is refused.
      //
      // This is what makes push work without anyone having to keep the build
      // configuration and the database in agreement. A token is minted against
      // exactly one gateway, and which one is decided by the *provisioning
      // profile the app was signed with* — not by the APS_ENVIRONMENT build
      // setting, which automatic signing overwrites. So a locally installed
      // Release build carries a sandbox token while reporting "production",
      // and a TestFlight build of the same commit carries a production one.
      //
      // Before this, either mismatch came back `BadDeviceToken` and the device
      // was permanently disabled — one bad send and that phone never received
      // another push until somebody reinstalled the app. Now the wrong guess
      // costs one extra round trip, once, and corrects itself.
      const preferred = gatewayFor(device.environment);
      let attempt = await sendOne(preferred, device.token, jwt, payload);
      let usedGateway = preferred;

      if (attempt.status !== 200 && looksLikeWrongGateway(attempt)) {
        const fallback = otherGateway(preferred);
        const retry = await sendOne(fallback, device.token, jwt, payload);
        if (retry.status === 200) {
          attempt = retry;
          usedGateway = fallback;
          logger.info(
            { rollNo: request.recipient.rollNo, environment: environmentFor(fallback) },
            "Device was registered against the wrong APNs gateway, corrected"
          );
        } else {
          // Refused by both. Only now is it a dead token rather than a
          // misfiled one, and the reason recorded is the first gateway's,
          // which is the one the device claimed to belong to.
          await DeviceToken.updateOne(
            { _id: device._id },
            {
              $set: {
                disabledAt: new Date(),
                disabledReason: attempt.reason || String(attempt.status || "unknown"),
              },
            }
          );
          continue;
        }
      }

      if (attempt.status === 200) {
        anyDelivered = true;
        await DeviceToken.updateOne(
          { _id: device._id },
          {
            $set: {
              lastSeenAt: new Date(),
              // Written back so the next send goes straight to the gateway that
              // worked. The correction above is a one-off, not a permanent
              // doubling of every push to this device.
              environment: environmentFor(usedGateway),
            },
          }
        );
        continue;
      }

      logger.warn(
        { status: attempt.status, reason: attempt.reason, rollNo: request.recipient.rollNo },
        "APNs rejected a push"
      );
    }

    return anyDelivered
      ? { channel: "push", delivered: true }
      : { channel: "push", delivered: false, skipped: "no device accepted it" };
  },
};

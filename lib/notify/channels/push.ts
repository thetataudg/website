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

function gatewayFor(environment: string): string {
  return environment === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";
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
      const attempt = await sendOne(
        gatewayFor(device.environment),
        device.token,
        jwt,
        payload
      );
      if (attempt.status === 200) {
        anyDelivered = true;
        await DeviceToken.updateOne(
          { _id: device._id },
          { $set: { lastSeenAt: new Date() } }
        );
        continue;
      }
      // A dead token is a fact about the device, not a failure of the send.
      // Recording it stops us retrying it nightly forever.
      if (
        attempt.status === 410 ||
        attempt.reason === "BadDeviceToken" ||
        attempt.reason === "Unregistered"
      ) {
        await DeviceToken.updateOne(
          { _id: device._id },
          { $set: { disabledAt: new Date(), disabledReason: attempt.reason || "410" } }
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

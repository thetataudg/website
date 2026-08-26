// app/api/appstore/webhook/route.ts
// The listener App Store Connect posts to. Everything it knows how to do is
// relay: verify the signature, read the event, put an embed in Discord.
//
// The status codes matter more than usual here. App Store Connect redelivers
// on a non-2xx, so a 200 is a promise that the news reached Discord. When
// Discord is the thing that failed we answer 502 on purpose and let Apple try
// again, and when the payload is unrecognised we still answer 200, because
// Apple retrying will not make us understand it any better.
import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import {
  normalizeAppStoreEvent,
  verifyAppStoreSignature,
} from "@/lib/appstore/webhookEvents";
import { buildAppStoreDiscordMessage } from "@/lib/appstore/discordEmbed";
import { postDiscordWebhook } from "@/lib/discordWebhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.APP_STORE_WEBHOOK_SECRET;
const DISCORD_URL = process.env.APP_STORE_DISCORD_WEBHOOK_URL;
const APP_NAME = process.env.APP_STORE_APP_NAME || "Theta Tau";
const ASC_APP_ID = process.env.APP_STORE_CONNECT_APP_ID || null;
/// The app icon, used as the Discord avatar and the small icon on the embed's
/// author line. Defaults to the App Store artwork; overridable because that
/// mzstatic URL is tied to the current icon asset and changes if the icon does.
const AVATAR_URL =
  process.env.APP_STORE_ICON_URL ||
  "https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/38/b5/cb/38b5cb04-89d7-3a3f-b0f7-34be76534b35/Placeholder.mill/1260x1260bb.png";

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    logger.error("APP_STORE_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "App Store webhook secret is missing" },
      { status: 500 }
    );
  }
  if (!DISCORD_URL) {
    logger.error("APP_STORE_DISCORD_WEBHOOK_URL is not configured");
    return NextResponse.json(
      { error: "Discord webhook URL is missing" },
      { status: 500 }
    );
  }

  // Read the body exactly once, as text. The HMAC is over these bytes, so
  // anything that reparses and re-serialises first will never match.
  const rawBody = await req.text();
  const signature = req.headers.get("x-apple-signature");

  if (!verifyAppStoreSignature(rawBody, signature, WEBHOOK_SECRET)) {
    logger.warn(
      { hasSignature: Boolean(signature), bytes: rawBody.length },
      "Rejected an App Store webhook with a bad signature"
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    logger.warn("App Store webhook body was not JSON");
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const event = normalizeAppStoreEvent(payload);

  if (!event.eventType && !event.ping) {
    // Signed, so it is genuinely from Apple, but a type we have no mapping
    // for. It still gets relayed, with the raw type in the title, and it is
    // still a 200 so Apple stops retrying.
    logger.info({ rawType: event.rawType }, "Relaying an unrecognised App Store event");
  }

  const result = await postDiscordWebhook(
    DISCORD_URL,
    buildAppStoreDiscordMessage(event, {
      appName: APP_NAME,
      appStoreConnectAppId: ASC_APP_ID,
      avatarUrl: AVATAR_URL,
    })
  );

  if (!result.ok) {
    logger.error(
      { status: result.status, error: result.error, eventType: event.eventType },
      "Failed to relay an App Store event to Discord"
    );
    return NextResponse.json(
      { error: "Discord delivery failed", status: result.status },
      { status: 502 }
    );
  }

  logger.info(
    { eventType: event.eventType ?? event.rawType, eventId: event.eventId },
    "Relayed an App Store event to Discord"
  );

  return NextResponse.json(
    {
      status: "ok",
      eventType: event.eventType ?? event.rawType,
      eventId: event.eventId,
      relayed: true,
    },
    { status: 200 }
  );
}

/// A readiness check for after a deploy. Says whether the endpoint is wired up
/// without revealing either secret.
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      endpoint: "App Store Connect webhook relay",
      configured: {
        secret: Boolean(WEBHOOK_SECRET),
        discordWebhook: Boolean(DISCORD_URL),
        appStoreConnectAppId: Boolean(ASC_APP_ID),
      },
      appName: APP_NAME,
      iconUrl: AVATAR_URL,
    },
    { status: 200 }
  );
}

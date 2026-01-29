import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { createHmac } from "node:crypto";
import { requireAuth } from "@/lib/clerk";

const DISCORD_LINK_CLIENT_ID = process.env.DISCORD_LINK_CLIENT_ID;
const DISCORD_LINK_REDIRECT_URI = process.env.DISCORD_LINK_REDIRECT_URI;
const DISCORD_LINK_STATE_SECRET = process.env.DISCORD_LINK_STATE_SECRET;
const STATE_TTL_MS = 5 * 60 * 1000;

function normalizeRedirectTo(value: string | null) {
  if (!value) return "/member";
  if (value.startsWith("/")) return value;
  return "/member";
}

function encodeState(payload: string) {
  const secret = DISCORD_LINK_STATE_SECRET;
  if (!secret) return null;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}|${signature}`).toString("base64");
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!DISCORD_LINK_CLIENT_ID || !DISCORD_LINK_REDIRECT_URI || !DISCORD_LINK_STATE_SECRET) {
    logger.error("Missing Discord link configuration");
    return NextResponse.json(
      { error: "Discord linking is not configured" },
      { status: 500 }
    );
  }

  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized attempt to start Discord link");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const memberRecord = await Member.findOne({ clerkId }).lean();
  const member = Array.isArray(memberRecord) ? memberRecord[0] : memberRecord;
  if (!member) {
    logger.warn({ clerkId }, "Discord link requested but member profile missing");
    return NextResponse.json({ error: "Member record missing" }, { status: 404 });
  }

  const url = new URL(req.url);
  const redirectTo = normalizeRedirectTo(url.searchParams.get("redirectTo"));
  const payload = JSON.stringify({
    clerkId,
    memberId: member._id?.toString() || "",
    redirectTo,
    expiresAt: Date.now() + STATE_TTL_MS,
  });
  const state = encodeState(payload);
  if (!state) {
    logger.error("Failed to encode Discord link state");
    return NextResponse.json({ error: "Discord linking is not available" }, { status: 500 });
  }

  const authorizeUrl = new URL("https://discord.com/api/oauth2/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", DISCORD_LINK_CLIENT_ID);
  authorizeUrl.searchParams.set("scope", "identify");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("redirect_uri", DISCORD_LINK_REDIRECT_URI);
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl.toString());
}

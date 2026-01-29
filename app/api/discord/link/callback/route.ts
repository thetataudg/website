import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import { createHmac, timingSafeEqual } from "node:crypto";

const DISCORD_LINK_CLIENT_ID = process.env.DISCORD_LINK_CLIENT_ID;
const DISCORD_LINK_CLIENT_SECRET = process.env.DISCORD_LINK_CLIENT_SECRET;
const DISCORD_LINK_REDIRECT_URI = process.env.DISCORD_LINK_REDIRECT_URI;
const DISCORD_LINK_STATE_SECRET = process.env.DISCORD_LINK_STATE_SECRET;

function decodeState(encoded: string | null) {
  if (!encoded || !DISCORD_LINK_STATE_SECRET) return null;
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const delimiter = decoded.lastIndexOf("|");
    if (delimiter <= 0) return null;
    const payload = decoded.slice(0, delimiter);
    const signature = decoded.slice(delimiter + 1);
    if (!payload || !signature) return null;
    const expected = createHmac("sha256", DISCORD_LINK_STATE_SECRET)
      .update(payload)
      .digest("hex");
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null;
    }
    const parsed = JSON.parse(payload);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.clerkId !== "string"
    ) {
      return null;
    }
    return parsed as {
      clerkId: string;
      memberId: string;
      redirectTo: string;
      expiresAt: number;
    };
  } catch (err) {
    logger.warn({ err }, "Failed to decode Discord link state");
    return null;
  }
}

function normalizeRedirectTo(value: string | undefined) {
  if (!value) return "/member";
  if (value.startsWith("/")) return value;
  return "/member";
}

function buildRedirectUrl(req: Request, target: string) {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (() => {
      try {
        const parsed = new URL(req.url);
        return `${parsed.protocol}//${parsed.host}`;
      } catch {
        return "";
      }
    })();
  const destination = normalizeRedirectTo(target);
  return base ? `${base}${destination}` : destination;
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (
    !DISCORD_LINK_CLIENT_ID ||
    !DISCORD_LINK_CLIENT_SECRET ||
    !DISCORD_LINK_REDIRECT_URI ||
    !DISCORD_LINK_STATE_SECRET
  ) {
    logger.error("Discord link callback missing configuration");
    return NextResponse.json(
      { error: "Discord linking is not configured" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing Discord code or state" },
      { status: 400 }
    );
  }

  const decoded = decodeState(state);
  if (!decoded) {
    return NextResponse.json(
      { error: "Invalid or expired Discord state" },
      { status: 400 }
    );
  }
  if (Date.now() > decoded.expiresAt) {
    return NextResponse.json(
      { error: "Discord authorization expired" },
      { status: 400 }
    );
  }

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: DISCORD_LINK_CLIENT_ID,
      client_secret: DISCORD_LINK_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: DISCORD_LINK_REDIRECT_URI,
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text().catch(() => "");
    logger.error(
      { status: tokenResponse.status, body },
      "Discord token exchange failed"
    );
    return NextResponse.json(
      { error: "Failed to complete Discord authorization" },
      { status: 500 }
    );
  }

  const tokenPayload = await tokenResponse.json().catch(() => null);
  const discordAccessToken = tokenPayload?.access_token;
  if (!discordAccessToken) {
    return NextResponse.json(
      { error: "Discord access token missing" },
      { status: 500 }
    );
  }

  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${discordAccessToken}` },
  });
  if (!userResponse.ok) {
    const body = await userResponse.text().catch(() => "");
    logger.error(
      { status: userResponse.status, body },
      "Fetching Discord user failed"
    );
    return NextResponse.json(
      { error: "Failed to retrieve Discord user" },
      { status: 500 }
    );
  }

  const discordUser = await userResponse.json().catch(() => null);
  const discordId = discordUser?.id;
  if (!discordId) {
    return NextResponse.json(
      { error: "Discord user returned no ID" },
      { status: 500 }
    );
  }

  await connectDB();
  const conflict = await Member.findOne({
    discordId,
    clerkId: { $ne: decoded.clerkId },
  }).lean();
  if (conflict) {
    return NextResponse.json(
      { error: "This Discord account is linked to another profile" },
      { status: 409 }
    );
  }

  const updated = await Member.findOneAndUpdate(
    { clerkId: decoded.clerkId },
    { discordId },
    { new: true }
  ).lean();

  if (!updated) {
    return NextResponse.json(
      { error: "Member profile not found during Discord link" },
      { status: 404 }
    );
  }

  return NextResponse.redirect(buildRedirectUrl(req, decoded.redirectTo));
}

// app/api/devices/route.ts
// Where an iOS device says "you can push to me".
//
// Upserted on the token rather than the member: one person can carry two
// phones, and a token can move to a different account when a device is handed
// on. Re-registering a token that was previously disabled brings it back — the
// device is evidently alive again.
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import DeviceToken from "@/lib/models/DeviceToken";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  try {
    await connectDB();
    const member = await Member.findOne({ clerkId }).select("_id rollNo").lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    // APNs device tokens are hex. Rejecting anything else here keeps junk out
    // of the send loop, where a bad token costs a round trip to Apple.
    if (!/^[0-9a-fA-F]{32,200}$/.test(token)) {
      return NextResponse.json({ error: "Invalid device token" }, { status: 400 });
    }

    // Production unless the build explicitly says otherwise. This is only the
    // first gateway the push channel tries: it falls back to the other one and
    // writes back whichever accepted the token, so a wrong hint here costs one
    // extra round trip once rather than silently killing push for the device.
    const environment =
      body?.environment === "development" ? "development" : "production";

    await DeviceToken.findOneAndUpdate(
      { token },
      {
        $set: {
          memberId: member._id,
          token,
          platform: "ios",
          environment,
          appVersion: String(body?.appVersion || ""),
          lastSeenAt: new Date(),
          disabledAt: null,
          disabledReason: "",
        },
      },
      { upsert: true, new: true }
    );

    logger.info({ rollNo: member.rollNo, environment }, "Device registered for push");
    return NextResponse.json({ registered: true }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to register device");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/// Turning push off from the app: the row stays so the history of the device is
/// intact, but nothing is sent to it again until it re-registers.
export async function DELETE(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  try {
    await connectDB();
    const member = await Member.findOne({ clerkId }).select("_id").lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();

    const filter: any = { memberId: member._id, disabledAt: null };
    if (token) filter.token = token;

    const result = await DeviceToken.updateMany(filter, {
      $set: { disabledAt: new Date(), disabledReason: "member opted out" },
    });
    return NextResponse.json({ disabled: result.modifiedCount ?? 0 }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to disable device");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

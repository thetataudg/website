import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import LockdownState from "@/lib/models/LockdownState";
import Member from "@/lib/models/Member";
import { getAuth } from "@clerk/nextjs/server";

const LOCKDOWN_KEY = "global";

type AdminUser = {
  role?: "admin" | "superadmin" | "member" | string;
  fName?: string;
  lName?: string;
};

const serialize = (doc: any) => {
  if (!doc) return {
    active: false,
    reason: "",
    durationMinutes: 0,
    startedAt: null,
    endsAt: null,
    createdBy: "",
  };
  const { active, reason, durationMinutes, startedAt, endsAt, createdBy } = doc;
  return {
    active: Boolean(active),
    reason: reason || "",
    durationMinutes: durationMinutes || 0,
    startedAt: startedAt ? new Date(startedAt).toISOString() : null,
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    createdBy: createdBy || "",
  };
};

async function ensureAdmin(req: NextRequest) {
  const { userId } = getAuth(req as any);
  if (!userId) {
    throw new Error("Unauthorized");
  }
  await connectDB();
  const rawUser = await Member.findOne({ clerkId: userId }).lean();
  const user = (Array.isArray(rawUser) ? null : rawUser) as AdminUser | null;
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    throw new Error("Unauthorized");
  }
  return user;
}

async function updateState(payload: {
  active: boolean;
  reason?: string;
  durationMinutes?: number;
  createdBy?: string;
  action?: string;
}) {
  const now = new Date();
  const durationMinutes = payload.durationMinutes || 0;
  const endsAt = durationMinutes > 0 ? new Date(now.getTime() + durationMinutes * 60000) : null;
  const doc = await LockdownState.findOneAndUpdate(
    { key: LOCKDOWN_KEY },
    {
      $set: {
        key: LOCKDOWN_KEY,
        active: payload.active,
        reason: payload.reason || "",
        durationMinutes,
        startedAt: payload.active ? now : null,
        endsAt: payload.active ? endsAt : null,
        createdBy: payload.createdBy || "",
      },
    },
    { upsert: true, new: true }
  ).lean();
  return serialize(doc);
}

export async function POST(req: NextRequest) {
  try {
    const admin = await ensureAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action === "release" ? "release" : "engage";
    if (action === "release") {
      const result = await updateState({ active: false });
      return NextResponse.json(result);
    }
    const reason = body.reason?.trim() || "";
    const durationMinutes = Number(body.durationMinutes || body.duration || 0);
    const result = await updateState({
      active: true,
      reason,
      durationMinutes,
      createdBy: `${admin.fName || ""} ${admin.lName || ""}`.trim() || admin.role,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("POST /api/admin/lockdown error", err);
    return new NextResponse(err?.message || "Unauthorized", { status: 401 });
  }
}

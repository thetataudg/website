import { NextRequest, NextResponse } from "next/server";
import LockdownState from "@/lib/models/LockdownState";
import { connectDB } from "@/lib/db";

const LOCKDOWN_KEY = "global";
const SECRET = process.env.LOCKDOWN_API_SECRET;

const defaultState = {
  active: false,
  reason: "",
  durationMinutes: 0,
  startedAt: null,
  endsAt: null,
  createdBy: "",
};

const requireSecret = (req: NextRequest) => {
  if (!SECRET) return;
  const header = req.headers.get("x-lockdown-secret") || "";
  const auth = req.headers.get("authorization")?.replace("Bearer ", "") || "";
  const token = header || auth;
  if (token !== SECRET) {
    throw new Error("Unauthorized");
  }
};

const serialize = (doc: any) => {
  if (!doc) return defaultState;
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

async function getState() {
  await connectDB();
  const doc = await LockdownState.findOne({ key: LOCKDOWN_KEY }).lean();
  return serialize(doc);
}

export async function GET() {
  try {
    const result = await getState();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("GET /api/lockdown error", err);
    return new NextResponse("Failed to fetch lockdown state", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    requireSecret(req);
    const payload = await req.json();
    const active = payload.active ?? true;
    const reason = payload.reason?.trim() || "";
    const durationMinutes = Number(payload.durationMinutes || payload.duration || 0);
    const now = new Date();
    const endsAt =
      durationMinutes > 0
        ? new Date(now.getTime() + durationMinutes * 60_000)
        : payload.endsAt
        ? new Date(payload.endsAt)
        : null;
    const doc = await LockdownState.findOneAndUpdate(
      { key: LOCKDOWN_KEY },
      {
        $set: {
          key: LOCKDOWN_KEY,
          active,
          reason,
          durationMinutes,
          startedAt: active ? now : null,
          endsAt: active ? endsAt : null,
          createdBy: payload.createdBy || payload.by || "",
        },
      },
      { upsert: true, new: true }
    ).lean();
    return NextResponse.json(serialize(doc));
  } catch (err: any) {
    console.error("POST /api/lockdown error", err);
    const status = err?.message === "Unauthorized" ? 401 : 500;
    return new NextResponse(err?.message || "Failed to update lockdown", { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    requireSecret(req);
    const doc = await LockdownState.findOneAndUpdate(
      { key: LOCKDOWN_KEY },
      {
        $set: {
          key: LOCKDOWN_KEY,
          active: false,
          reason: "",
          durationMinutes: 0,
          startedAt: null,
          endsAt: null,
          createdBy: "",
        },
      },
      { upsert: true, new: true }
    ).lean();
    return NextResponse.json(serialize(doc));
  } catch (err: any) {
    console.error("DELETE /api/lockdown error", err);
    const status = err?.message === "Unauthorized" ? 401 : 500;
    return new NextResponse(err?.message || "Failed to reset lockdown", { status });
  }
}

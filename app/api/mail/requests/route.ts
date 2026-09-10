// app/api/mail/requests/route.ts
// Pending chapter email requests, for the admin Requests queue.
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import { listPendingMailRequests } from "@/lib/mail/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    await requireRole(req, ["superadmin", "admin"]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 });
  }
  return NextResponse.json({ requests: await listPendingMailRequests() });
}

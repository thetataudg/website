// app/api/availability/resolve/route.ts
// GET ?committee=<slug>&poll=<slug> - the poll id behind a shared link, for the
// iOS app, which receives /member/<committee>/poll/<slug> as a universal link
// and has no redirect to follow. Access is checked by GET /api/availability/[id].
import { NextResponse } from "next/server";
import logger from "@/lib/logger";
import { currentMember } from "@/lib/availability/routeHelpers";
import { resolvePollSlug } from "@/lib/availability/slug";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await currentMember(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }

  const url = new URL(req.url);
  const committee = url.searchParams.get("committee");
  const poll = url.searchParams.get("poll");
  if (!committee || !poll) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  try {
    const found = await resolvePollSlug(committee, poll);
    if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(found, { status: 200 });
  } catch (err: any) {
    logger.error({ err, committee, poll }, "Failed to resolve poll slug");
    return NextResponse.json({ error: "Failed to resolve poll" }, { status: 500 });
  }
}

// POST /api/admin/notification-center/send — send a custom message.
//
// The browser sends the selection (groups, committees, hand-picked members),
// never a list of recipients: the audience is resolved again here with the
// same rule the compose page previewed, against the roster as it is now.
//
// Answers as soon as the history row exists and delivers behind the response,
// the same way a newsletter announcement does. The page follows progress on
// the history row.
import { NextResponse } from "next/server";
import { requireChapterToolSubmitter } from "@/lib/chapterTools";
import { queueBroadcast } from "@/lib/notify/sendBroadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let actor;
  try {
    actor = await requireChapterToolSubmitter(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 403 });
  }
  const submitter = actor.submitter as any;

  const payload = await req.json().catch(() => null);
  // Validation, audience resolution and the queued send live in
  // `lib/notify/sendBroadcast.ts`, shared with the MCP server.
  const result = await queueBroadcast(submitter, payload);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(
    { id: result.id, recipientCount: result.recipientCount },
    { status: 202 }
  );
}

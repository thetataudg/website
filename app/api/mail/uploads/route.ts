// app/api/mail/uploads/route.ts
// One attachment for a message being composed, stored under this mailbox's own
// prefix. Uploaded through the server rather than a presigned PUT, like
// receipts, so the bucket needs no CORS rules.
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { putMailObject, safeFilename, storageConfigured } from "@/lib/mail/storage";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Netlify caps a function's request body at about 6 MB. This leaves room for
/// the multipart envelope.
const MAX_FILE_BYTES = 4.5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const { account } = await requireMailbox();
    if (!storageConfigured()) {
      return NextResponse.json({ error: "Attachments aren't set up on this server yet." }, { status: 503 });
    }
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file received." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Each file can be 4.5 MB at most." }, { status: 413 });
    }
    const filename = safeFilename(file.name);
    const contentType = (file.type || "application/octet-stream").slice(0, 100);
    const key = `mail/out/${account._id}/${randomUUID()}/${filename}`;
    await putMailObject(key, Buffer.from(await file.arrayBuffer()), contentType);
    return NextResponse.json({ key, filename, contentType, size: file.size }, { status: 201 });
  } catch (err) {
    logger.warn({ err }, "Mail attachment upload failed");
    return mailErrorResponse(err);
  }
}

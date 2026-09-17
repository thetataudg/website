// Images embedded in saved signatures. The object key contains an unguessable
// token, and the public read route only exposes that exact object through a
// short-lived redirect so recipients can see it in delivered email.
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { mailErrorResponse, requireMailbox } from "@/lib/mail/session";
import { putMailObject, safeFilename, storageConfigured } from "@/lib/mail/storage";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function POST(req: NextRequest) {
  try {
    await requireMailbox();
    if (!storageConfigured()) {
      return NextResponse.json({ error: "Signature images aren't set up on this server yet." }, { status: 503 });
    }
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No image received." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Use a PNG, JPEG, GIF, or WebP image." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Signature images can be 2 MB at most." }, { status: 413 });
    }

    const token = randomUUID();
    const filename = safeFilename(file.name);
    const key = `mail/signatures/${token}/${filename}`;
    await putMailObject(key, Buffer.from(await file.arrayBuffer()), file.type);

    return NextResponse.json(
      { src: `/api/mail/signature-images/${token}/${encodeURIComponent(filename)}` },
      { status: 201 }
    );
  } catch (err) {
    logger.warn({ err }, "Signature image upload failed");
    return mailErrorResponse(err);
  }
}

// Public-by-token image delivery for email clients. Signature HTML contains
// this stable URL; each request is redirected to a short-lived object URL.
import { NextRequest, NextResponse } from "next/server";
import { presignMailGet, safeFilename, storageConfigured } from "@/lib/mail/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; filename: string } }
) {
  if (!storageConfigured() || !UUID.test(params.token)) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
  const filename = safeFilename(params.filename);
  if (!filename || filename !== params.filename) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
  try {
    const url = await presignMailGet(`mail/signatures/${params.token}/${filename}`, {
      filename,
      inline: true,
      expiresIn: 300,
    });
    return NextResponse.redirect(url, { status: 307 });
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}

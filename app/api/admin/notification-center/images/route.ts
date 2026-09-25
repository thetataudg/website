// POST /api/admin/notification-center/images — upload a notification picture.
//
// Stored in the newsletter bucket under `notifications/`, re-encoded to JPEG
// with the EXIF stripped. Kept small: iOS draws it as a thumbnail and only
// expands it on a long press, and the notification service extension has a
// few seconds to download it before iOS gives up and shows the text alone.
import path from "path";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import logger from "@/lib/logger";
import { requireChapterToolSubmitter } from "@/lib/chapterTools";
import {
  createNewsletterClient,
  getNewsletterBucket,
  signNewsletterImage,
} from "@/lib/newsletterStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_EDGE = 1200;
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif"]);

type FileLike = {
  name: string;
  size: number;
  type?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

const isFileLike = (value: unknown): value is FileLike => {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<FileLike>;
  return (
    typeof maybe.name === "string" &&
    typeof maybe.size === "number" &&
    typeof maybe.arrayBuffer === "function"
  );
};

async function normalizeImage(source: Buffer): Promise<Buffer | null> {
  try {
    // Plain dynamic import so Next traces sharp into the deploy. See the note
    // in app/api/newsletters/images/route.ts.
    const sharp = (await import("sharp")).default;
    return await sharp(source)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch (err: any) {
    logger.warn({ err }, "sharp unavailable for notification image, storing as uploaded");
    return null;
  }
}

export async function POST(req: Request) {
  try {
    await requireChapterToolSubmitter(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 403 });
  }

  try {
    const bucket = getNewsletterBucket();
    const client = bucket ? await createNewsletterClient() : null;
    if (!bucket || !client) {
      return NextResponse.json({ error: "Image storage is not configured." }, { status: 500 });
    }

    const form = await req.formData();
    const entry = form.get("file");
    if (!isFileLike(entry)) {
      return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
    }
    const ext = path.extname(entry.name || "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: "Images only: JPEG, PNG, HEIC, GIF or WebP." },
        { status: 400 }
      );
    }
    if (entry.size > MAX_BYTES) {
      return NextResponse.json({ error: "That image is over 12 MB." }, { status: 413 });
    }

    const original = Buffer.from(await entry.arrayBuffer());
    const normalized = await normalizeImage(original);
    const body = normalized ?? original;
    const contentType = normalized ? "image/jpeg" : entry.type || "application/octet-stream";
    const storedExt = normalized ? ".jpg" : ext;
    const imageKey = `notifications/${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}${storedExt}`;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: imageKey,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      })
    );

    const imageUrl = await signNewsletterImage(imageKey);
    return NextResponse.json({ imageKey, imageUrl }, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to upload notification image");
    return NextResponse.json({ error: "The image could not be uploaded." }, { status: 500 });
  }
}

// POST /api/newsletters/images — put one picture in the bucket, get a key back.
//
// Separate from the article's own save, and that is the whole design. The
// builder uploads as soon as a photo is dropped in, so a long article with
// eight pictures is eight small requests instead of one enormous one that
// times out on hotel wifi and loses an evening's writing. What comes back is
// an object key; the article stores the key and the reader gets a fresh signed
// URL on every read.
import path from "path";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import logger from "@/lib/logger";
import { requireNewsletterEditor } from "@/lib/newsletterAuth";
import {
  createNewsletterClient,
  deleteNewsletterImage,
  getNewsletterBucket,
  signNewsletterImage,
} from "@/lib/newsletterStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;
/// Wide enough for a full-bleed hero on a 3x phone and a desktop article
/// column, and small enough that a member on cellular is not downloading a
/// 6000px photo straight off somebody's camera.
const MAX_EDGE = 2000;

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"]);

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

/// Re-encode to JPEG, cap the long edge, and read the result's real size.
///
/// `rotate()` with no argument bakes in the EXIF orientation, which is what
/// stops a photo taken sideways from arriving sideways. Re-encoding also drops
/// the rest of the EXIF, and that matters more than the bytes it saves: phone
/// photos carry GPS coordinates, and an article is a public page.
///
/// Returns null when sharp is unavailable, so the caller can fall back to
/// storing what it was given rather than refusing the upload.
async function normalizeImage(
  source: Buffer
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  try {
    // A plain dynamic import, matching `appleWalletPass` — see the long note
    // there before changing this. sharp is native and must stay out of the
    // bundle, but Next already keeps it external on its own; the `new Function`
    // indirection that used to be here hid the specifier from Next's tracer as
    // well, so sharp never shipped to production and this returned null on
    // every deployed upload. Newsletter images were stored exactly as the
    // browser sent them: full size, and without EXIF rotation applied.
    const sharp = (await import("sharp")).default;

    const buffer = await sharp(source)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    return {
      buffer,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    };
  } catch (err: any) {
    logger.warn({ err }, "sharp unavailable for newsletter image, storing as uploaded");
    return null;
  }
}

export async function POST(req: Request) {
  try {
    await requireNewsletterEditor();

    const bucket = getNewsletterBucket();
    if (!bucket) {
      return NextResponse.json(
        { error: "Newsletter image storage is not configured" },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const entry = form.get("file");
    if (!isFileLike(entry)) {
      return NextResponse.json({ error: "No file was uploaded" }, { status: 400 });
    }

    const ext = path.extname(entry.name || "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: "Images only: JPEG, PNG, HEIC or WebP." },
        { status: 400 }
      );
    }
    if (entry.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "That image is over 12 MB. Try a smaller one." },
        { status: 413 }
      );
    }

    const original = Buffer.from(await entry.arrayBuffer());
    const normalized = await normalizeImage(original);
    const body = normalized?.buffer ?? original;
    const contentType = normalized ? "image/jpeg" : entry.type || "application/octet-stream";
    const storedExt = normalized ? ".jpg" : ext;

    const client = await createNewsletterClient();
    if (!client) {
      return NextResponse.json(
        { error: "Newsletter image storage is not configured" },
        { status: 500 }
      );
    }

    // Random rather than derived from the filename. Two officers uploading
    // IMG_4021.jpg to different issues must not collide, and a key that is not
    // guessable keeps the bucket from being enumerable.
    const objectKey = `newsletters/${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}${storedExt}`;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
        ContentLength: body.length,
      })
    );

    const imageUrl = await signNewsletterImage(objectKey);
    if (!imageUrl) {
      // Stored but unreadable is worse than not stored: the builder would show
      // a broken block the officer cannot diagnose.
      await deleteNewsletterImage(objectKey);
      return NextResponse.json(
        { error: "The image was uploaded but could not be read back." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        imageKey: objectKey,
        imageUrl,
        width: normalized?.width ?? 0,
        height: normalized?.height ?? 0,
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err?.statusCode) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error({ err }, "Failed to upload newsletter image");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

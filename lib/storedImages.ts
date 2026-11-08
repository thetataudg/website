// lib/storedImages.ts
// Uploaded pictures that are not newsletter artwork: the rush poster and bug
// report screenshots.
//
// Same bucket and the same sharp treatment as `app/api/newsletters/images`:
// rotate to bake in EXIF orientation, re-encode to JPEG (which drops EXIF,
// including GPS), cap the long edge at 2000 px. Only the key is stored, and
// the picture is served from our own route, because `next.config.mjs` has no
// `remotePatterns` and caches images for a year: every upload gets a new key,
// so a cached copy is never wrong.
import path from "path";
import { randomUUID } from "crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import logger from "@/lib/logger";
import { badRequest, HttpError } from "@/lib/httpError";
import {
  createNewsletterClient,
  getNewsletterBucket,
} from "@/lib/newsletterStorage";

export const IMAGE_MAX_EDGE = 2000;
export const ALLOWED_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
  ".webp",
]);

export type FileLike = {
  name: string;
  size: number;
  type?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export const isFileLike = (value: unknown): value is FileLike => {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<FileLike>;
  return (
    typeof maybe.name === "string" &&
    typeof maybe.size === "number" &&
    typeof maybe.arrayBuffer === "function"
  );
};

async function normalize(
  source: Buffer
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const buffer = await sharp(source)
      .rotate()
      .resize({
        width: IMAGE_MAX_EDGE,
        height: IMAGE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    return { buffer, width: meta.width ?? 0, height: meta.height ?? 0 };
  } catch (err: any) {
    logger.warn({ err }, "sharp unavailable, refusing unnormalized upload");
    return null;
  }
}

export interface StoredImage {
  key: string;
  width: number;
  height: number;
}

/// Normalizes and stores one image under `${prefix}/<stamp>-<uuid>.jpg`.
///
/// Unlike newsletters, an image sharp cannot read is refused rather than stored
/// as sent: these are a public page and private screenshots, and an original
/// would keep its EXIF.
export async function storeImage(
  file: unknown,
  prefix: string,
  maxBytes: number
): Promise<StoredImage> {
  if (!isFileLike(file)) throw badRequest("No file was uploaded");
  const ext = path.extname(file.name || "").toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    throw badRequest("Images only: JPEG, PNG, HEIC or WebP.");
  }
  if (file.size > maxBytes) {
    throw new HttpError(
      413,
      `That image is over ${Math.round(maxBytes / 1024 / 1024)} MB. Try a smaller one.`
    );
  }

  const normalized = await normalize(Buffer.from(await file.arrayBuffer()));
  if (!normalized) throw badRequest("That image could not be read.");

  const bucket = getNewsletterBucket();
  const client = await createNewsletterClient();
  if (!bucket || !client) throw new Error("Image storage is not configured");

  const key = `${prefix}/${Date.now().toString(36)}-${randomUUID()}.jpg`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: normalized.buffer,
      ContentType: "image/jpeg",
      ContentLength: normalized.buffer.length,
    })
  );
  return { key, width: normalized.width, height: normalized.height };
}

/// Reads one stored image back, or null when it is missing.
export async function readImage(key: string): Promise<Buffer | null> {
  const bucket = getNewsletterBucket();
  const client = await createNewsletterClient();
  if (!bucket || !client || !key) return null;
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (err: any) {
    if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/// Object keys arrive in URLs; accept only the shape we write.
export function isSafeImageKey(key: string, prefix: string): boolean {
  return (
    key.startsWith(`${prefix}/`) &&
    /^[a-z0-9/_-]+\.jpg$/i.test(key) &&
    !key.includes("..")
  );
}

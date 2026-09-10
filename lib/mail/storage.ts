// lib/mail/storage.ts
// Attachment bytes, in the Garage bucket.
//
// A private bucket of its own when S3_MAIL_BUCKET is set, falling back to the
// minutes bucket, which is already private. Nothing here is ever public: every
// read goes through an ownership check and a short-lived presigned URL.
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createMinutesClient } from "@/lib/minutesStorage";

export function mailBucket(): string | undefined {
  return process.env.S3_MAIL_BUCKET || process.env.S3_MINUTES_BUCKET;
}

export function storageConfigured(): boolean {
  return Boolean(mailBucket() && process.env.GARAGE_ACCESS_KEY && process.env.GARAGE_SECRET_KEY);
}

async function client() {
  const { client } = await createMinutesClient();
  const bucket = mailBucket();
  if (!client || !bucket) throw new Error("Mail storage is not configured");
  return { client, bucket };
}

/// Filenames arrive from strangers. Keep them readable, keep them safe.
export function safeFilename(name: string): string {
  const cleaned = String(name || "attachment")
    .replace(/[/\\?%*:|"<>\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "attachment";
}

export async function putMailObject(key: string, body: Buffer, contentType: string) {
  const { client: s3, bucket } = await client();
  await s3.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  );
}

export async function presignMailGet(
  key: string,
  opts: { filename?: string; inline?: boolean; expiresIn?: number } = {}
): Promise<string> {
  const { client: s3, bucket } = await client();
  const disposition = opts.filename
    ? `${opts.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(opts.filename)}`
    : undefined;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: disposition }),
    { expiresIn: opts.expiresIn ?? 60 }
  );
}

export async function presignMailPut(key: string, contentType: string, expiresIn = 600): Promise<string> {
  const { client: s3, bucket } = await client();
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

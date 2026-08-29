// lib/newsletterStorage.ts
// Where newsletter artwork lives.
//
// Same Garage cluster and the same signing dance as `minutesStorage`, kept
// separate for the same reason that one is separate from `garage.ts`: each
// bucket has its own name, its own object-key convention, and its own answer
// to "what happens when it isn't configured". Sharing one module meant every
// caller had to pass a bucket around.
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import logger from "@/lib/logger";

const garageEndpointRaw = process.env.NEXT_PUBLIC_GARAGE_ENDPOINT;
const garageRegion = process.env.NEXT_PUBLIC_GARAGE_REGION;
const garageAccessKey = process.env.GARAGE_ACCESS_KEY;
const garageSecretKey = process.env.GARAGE_SECRET_KEY;
const garageUseSSL = process.env.GARAGE_USE_SSL;

/// Falls back to the member-photo bucket so this works on a deployment that
/// has not provisioned a dedicated one yet. Set S3_NEWSLETTER_BUCKET in
/// production — article artwork and member headshots have different retention
/// and different audiences, and they should not share a namespace once there
/// is a choice.
const newsletterBucket =
  process.env.S3_NEWSLETTER_BUCKET || process.env.S3_PHOTO_BUCKET;

const isAwsEndpoint = (endpoint?: string) =>
  !!endpoint && endpoint.includes("amazonaws.com");

const resolvedEndpoint =
  garageEndpointRaw && !garageEndpointRaw.startsWith("http")
    ? `${garageUseSSL === "false" ? "http" : "https"}://${garageEndpointRaw}`
    : garageEndpointRaw;

export const getNewsletterBucket = () => newsletterBucket;

export const getNewsletterSigningRegion = () =>
  process.env.GARAGE_SIGNING_REGION ||
  (isAwsEndpoint(garageEndpointRaw) ? garageRegion : "garage") ||
  "";

const garageClockSyncEnabled =
  (process.env.GARAGE_ENABLE_CLOCK_SYNC || "").toLowerCase() === "true";

const resolveClockOffset = async () => {
  const override = process.env.GARAGE_CLOCK_SKEW_MS;
  if (override) {
    const parsed = Number(override);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (!resolvedEndpoint || !garageClockSyncEnabled) return 0;
  try {
    const res = await fetch(resolvedEndpoint, { method: "HEAD" });
    const serverDate = res.headers.get("date");
    if (serverDate) return new Date(serverDate).getTime() - Date.now();
  } catch (err: any) {
    logger.warn({ err }, "Failed to resolve Garage clock offset");
  }
  return 0;
};

export const createNewsletterClient = async () => {
  const signingRegion = getNewsletterSigningRegion();
  if (
    !resolvedEndpoint ||
    !signingRegion ||
    !garageAccessKey ||
    !garageSecretKey ||
    !newsletterBucket
  ) {
    return null;
  }
  return new S3Client({
    region: signingRegion,
    endpoint: resolvedEndpoint,
    credentials: {
      accessKeyId: garageAccessKey,
      secretAccessKey: garageSecretKey,
    },
    forcePathStyle: true,
    systemClockOffset: await resolveClockOffset(),
    // Garage rejects the checksum trailer the v3 SDK now sends by default.
    // Matched to `upload-file`, which hit the same wall.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
};

/// How long a signature stays byte-for-byte identical.
///
/// Same trick as `garage.ts`: signing with `new Date()` produces a different
/// URL on every render, so a browser — and the app's own image cache — can
/// never reuse what it already downloaded. An article with eight photos was
/// eight fresh downloads on every read. Rounding the signing time down to a
/// window makes every request inside it produce the same string.
const STABLE_WINDOW_SECONDS =
  Number(process.env.GARAGE_PRESIGN_STABLE_WINDOW_SECONDS) || 15 * 60;

/// A readable URL for one object key, or "" when storage isn't configured.
///
/// Empty rather than throwing: a missing bucket should cost the reader one
/// picture, not the whole article.
export const signNewsletterImage = async (
  key: string,
  expiresInSeconds = 60 * 60
): Promise<string> => {
  if (!key || !newsletterBucket) return "";
  try {
    const client = await createNewsletterClient();
    if (!client) return "";

    const windowMs = STABLE_WINDOW_SECONDS * 1000;
    const signingDate = new Date(Math.floor(Date.now() / windowMs) * windowMs);

    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: newsletterBucket,
        Key: key,
        ResponseCacheControl: `public, max-age=${STABLE_WINDOW_SECONDS}, stale-while-revalidate=${STABLE_WINDOW_SECONDS}`,
      }),
      {
        // The signature starts at the top of the window, not now, so a URL
        // handed out at the end of one would otherwise be nearly expired.
        expiresIn: Math.max(1, expiresInSeconds) + STABLE_WINDOW_SECONDS,
        signingDate,
      }
    );
  } catch (err: any) {
    logger.error({ err, key }, "Unable to sign newsletter image URL");
    return "";
  }
};

/// Best-effort cleanup when an article or a block is deleted.
///
/// Never throws. An orphaned object costs a few kilobytes; a delete that fails
/// the request costs the officer their edit.
export const deleteNewsletterImage = async (key: string): Promise<void> => {
  if (!key || !newsletterBucket) return;
  try {
    const client = await createNewsletterClient();
    if (!client) return;
    await client.send(
      new DeleteObjectCommand({ Bucket: newsletterBucket, Key: key })
    );
  } catch (err: any) {
    logger.warn({ err, key }, "Could not delete newsletter image");
  }
};

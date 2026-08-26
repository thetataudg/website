import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import logger from "@/lib/logger";

const garageEndpointRaw = process.env.NEXT_PUBLIC_GARAGE_ENDPOINT;
const garageRegion = process.env.NEXT_PUBLIC_GARAGE_REGION || "";
const garageAccessKey = process.env.GARAGE_ACCESS_KEY;
const garageSecretKey = process.env.GARAGE_SECRET_KEY;
const garageUseSSL = process.env.GARAGE_USE_SSL;
const isAwsEndpoint = (endpoint?: string) =>
  !!endpoint && endpoint.includes("amazonaws.com");

const garageSigningRegion =
  process.env.GARAGE_SIGNING_REGION ||
  (isAwsEndpoint(garageEndpointRaw) ? garageRegion : "garage");

const garageClockSyncEnabled =
  (process.env.GARAGE_ENABLE_CLOCK_SYNC || "").toLowerCase() === "true";

const resolvedEndpoint =
  garageEndpointRaw && !garageEndpointRaw.startsWith("http")
    ? `${garageUseSSL === "false" ? "http" : "https"}://${garageEndpointRaw}`
    : garageEndpointRaw;

const resolveClockOffsetMs = async () => {
  const override = process.env.GARAGE_CLOCK_SKEW_MS;
  if (override) {
    const parsed = Number(override);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (!resolvedEndpoint || !garageClockSyncEnabled) return 0;
  try {
    const res = await fetch(resolvedEndpoint, { method: "HEAD" });
    const serverDate = res.headers.get("date");
    if (serverDate) {
      const serverMs = new Date(serverDate).getTime();
      return serverMs - Date.now();
    }
  } catch (err: any) {
    logger.warn({ err }, "Failed to resolve Garage clock offset");
  }
  return 0;
};

const buildS3Client = async () => {
  if (!resolvedEndpoint || !garageSigningRegion || !garageAccessKey || !garageSecretKey) {
    return null;
  }
  const clockOffset = await resolveClockOffsetMs();
  const client = new S3Client({
    region: garageSigningRegion,
    endpoint: resolvedEndpoint,
    credentials: {
      accessKeyId: garageAccessKey,
      secretAccessKey: garageSecretKey,
    },
    forcePathStyle: true,
    systemClockOffset: clockOffset,
  });
  // Handed back because an explicit `signingDate` overrides the client's own
  // systemClockOffset, so the caller has to fold the offset in itself.
  return { client, clockOffset };
};

const parseGarageUrl = (url: string) => {
  if (!resolvedEndpoint) return null;
  try {
    const endpoint = new URL(resolvedEndpoint);
    const target = new URL(url);
    if (target.host !== endpoint.host) return null;
    const parts = target.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [bucket, ...rest] = parts;
    return { bucket, key: rest.join("/") };
  } catch {
    return null;
  }
};

/// How long a presigned URL stays byte-for-byte identical.
///
/// Signing with `new Date()` produced a different X-Amz-Date and X-Amz-Signature
/// on every single call, so the browser saw a brand new URL for the same photo
/// on every page load and could never reuse its cache: 40-odd avatars were
/// re-downloaded every time the roster rendered. Rounding the signing time down
/// to a window makes every request inside that window produce the exact same
/// string, which is all the HTTP cache needs.
///
/// It is also the ceiling on how long a replaced photo can keep showing the old
/// image, because uploads overwrite a stable key (members/<roll>/photo.jpg) and
/// so the URL itself never changes when the picture does.
const PRESIGN_STABLE_WINDOW_SECONDS =
  Number(process.env.GARAGE_PRESIGN_STABLE_WINDOW_SECONDS) || 15 * 60;

export const maybePresignUrl = async (
  url?: string,
  expiresInSeconds = Number(process.env.GARAGE_PRESIGN_EXPIRES_SECONDS) || 3600
) => {
  if (!url) return url;
  const parsed = parseGarageUrl(url);
  if (!parsed) return url;

  try {
    const built = await buildS3Client();
    if (!built) return url;
    const { client, clockOffset } = built;

    const windowMs = PRESIGN_STABLE_WINDOW_SECONDS * 1000;
    const signingDate = new Date(
      Math.floor((Date.now() + clockOffset) / windowMs) * windowMs
    );

    // The signature starts at the beginning of the stable window, not at the
    // instant this function is called. Add that window to the requested TTL so
    // a URL requested near the end of the window still remains valid for at
    // least `expiresInSeconds` from now. This is especially important for
    // short-lived server fetches such as Apple Wallet pass thumbnails.
    const effectiveExpiresIn =
      Math.max(1, expiresInSeconds) + PRESIGN_STABLE_WINDOW_SECONDS;

    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: parsed.bucket,
        Key: parsed.key,
        // A signed parameter, so it does not invalidate the signature the way a
        // hand-appended query string would. It makes Garage return the caching
        // headers the browser needs: serve from cache instantly, then
        // revalidate quietly in the background and swap if the bytes changed.
        ResponseCacheControl: `public, max-age=${PRESIGN_STABLE_WINDOW_SECONDS}, stale-while-revalidate=${PRESIGN_STABLE_WINDOW_SECONDS}`,
      }),
      { expiresIn: effectiveExpiresIn, signingDate }
    );
  } catch (err: any) {
    logger.warn({ err, url }, "Failed to presign Garage URL");
    return url;
  }
};

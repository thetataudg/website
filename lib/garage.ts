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
  return new S3Client({
    region: garageSigningRegion,
    endpoint: resolvedEndpoint,
    credentials: {
      accessKeyId: garageAccessKey,
      secretAccessKey: garageSecretKey,
    },
    forcePathStyle: true,
    systemClockOffset: clockOffset,
  });
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

export const maybePresignUrl = async (
  url?: string,
  expiresInSeconds = Number(process.env.GARAGE_PRESIGN_EXPIRES_SECONDS) || 3600
) => {
  if (!url) return url;
  const parsed = parseGarageUrl(url);
  if (!parsed) return url;

  try {
    const client = await buildS3Client();
    if (!client) return url;
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: parsed.bucket,
        Key: parsed.key,
      }),
      { expiresIn: expiresInSeconds }
    );
  } catch (err: any) {
    logger.warn({ err, url }, "Failed to presign Garage URL");
    return url;
  }
};

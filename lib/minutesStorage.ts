import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import logger from "@/lib/logger";

const garageEndpointRaw = process.env.NEXT_PUBLIC_GARAGE_ENDPOINT;
const garageRegion = process.env.NEXT_PUBLIC_GARAGE_REGION;
const garageAccessKey = process.env.GARAGE_ACCESS_KEY;
const garageSecretKey = process.env.GARAGE_SECRET_KEY;
const garageUseSSL = process.env.GARAGE_USE_SSL;
const minutesBucket = process.env.S3_MINUTES_BUCKET;

const isAwsEndpoint = (endpoint?: string) =>
  !!endpoint && endpoint.includes("amazonaws.com");

const resolvedEndpoint =
  garageEndpointRaw && !garageEndpointRaw.startsWith("http")
    ? `${garageUseSSL === "false" ? "http" : "https"}://${garageEndpointRaw}`
    : garageEndpointRaw;

export const getMinutesBucket = () => minutesBucket;

export const getMinutesSigningRegion = () =>
  process.env.GARAGE_SIGNING_REGION ||
  (isAwsEndpoint(garageEndpointRaw) ? garageRegion : "garage") ||
  "";

export const resolveMinutesClockOffset = async () => {
  const override = process.env.GARAGE_CLOCK_SKEW_MS;
  if (override) {
    const parsed = Number(override);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (!resolvedEndpoint) {
    return 0;
  }
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

export const buildMinutesS3Client = (
  clockOffsetMs: number,
  signingRegion: string
) => {
  if (
    !resolvedEndpoint ||
    !signingRegion ||
    !garageAccessKey ||
    !garageSecretKey
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
    systemClockOffset: clockOffsetMs,
  });
};

export const getMinutesPublicUrl = (key: string) => {
  if (!resolvedEndpoint || !minutesBucket) return "";
  const base = resolvedEndpoint.replace(/\/$/, "");
  return `${base}/${minutesBucket}/${encodeURIComponent(key).replace(
    /%2F/g,
    "/"
  )}`;
};

export const createMinutesClient = async () => {
  const signingRegion = getMinutesSigningRegion();
  const client = buildMinutesS3Client(
    await resolveMinutesClockOffset(),
    signingRegion
  );
  return { client, signingRegion };
};

export const getSignedMinutesUrl = async (key: string) => {
  if (!key || !minutesBucket) {
    return "";
  }
  try {
    const { client } = await createMinutesClient();
    if (!client) {
      return "";
    }
    const command = new GetObjectCommand({
      Bucket: minutesBucket,
      Key: key,
    });
    return await getSignedUrl(client, command, { expiresIn: 3600 });
  } catch (err: any) {
    logger.error({ err, key }, "Unable to generate signed minutes URL");
    return "";
  }
};

export const parseMinutesPublicUrl = (url: string) => {
  if (!resolvedEndpoint || !minutesBucket) return null;
  try {
    const endpoint = new URL(resolvedEndpoint);
    const target = new URL(url);
    if (endpoint.host !== target.host) return null;
    const parts = target.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [bucket, ...rest] = parts;
    return { bucket, key: rest.join("/") };
  } catch {
    return null;
  }
};

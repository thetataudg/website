// app/api/uploads/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs";
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "6mb",
    },
  },
};

const garageEndpointRaw = process.env.NEXT_PUBLIC_GARAGE_ENDPOINT;
const garageRegion = process.env.NEXT_PUBLIC_GARAGE_REGION;
const garageAccessKey = process.env.GARAGE_ACCESS_KEY;
const garageSecretKey = process.env.GARAGE_SECRET_KEY;
const garageUseSSL = process.env.GARAGE_USE_SSL;
const photoBucket = process.env.S3_PHOTO_BUCKET;
const resumeBucket = process.env.S3_RESUME_BUCKET;

const isAwsEndpoint = (endpoint?: string) =>
  !!endpoint && endpoint.includes("amazonaws.com");

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

const buildS3Client = (clockOffsetMs: number, signingRegion: string) => {
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
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
};

export async function POST(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    logger.warn({ err }, "Unauthorized upload attempt");
    return NextResponse.json(
      { error: err.message },
      { status: err.statusCode }
    );
  }
  // clerkId = "user_2vwl8HCQurdsEIIltj2XzQyWSGu";

  logger.info({ clerkId }, "Upload request started");
  await connectDB();

  const member = await Member.findOne({ clerkId })
    .select("rollNo")
    .lean<{ rollNo: string }>();
  if (!member) {
    logger.error({ clerkId }, "Upload failed: no member found");
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  const rollNo = member.rollNo;

  const clockOffsetMs = await resolveClockOffsetMs();
  const signingRegion =
    process.env.GARAGE_SIGNING_REGION ||
    (isAwsEndpoint(garageEndpointRaw) ? garageRegion : "garage") ||
    "";
  const s3 = buildS3Client(clockOffsetMs, signingRegion);
  if (!s3 || !photoBucket || !resumeBucket) {
    logger.error(
      { clerkId },
      "Upload failed: missing Garage/S3 configuration"
    );
    return NextResponse.json(
      { error: "Upload storage is not configured" },
      { status: 500 }
    );
  }

  const maxBytes = 5 * 1024 * 1024;
  const out: Record<string, string> = {};
  const update: Partial<{ profilePicUrl: string; resumeUrl: string }> = {};
  const allowed = {
    photo: [".jpg", ".jpeg", ".png"],
    resume: [".pdf", ".doc", ".docx"],
  };

  const contentTypeHeader = req.headers.get("content-type") || "";
  if (contentTypeHeader.includes("application/json")) {
    const body = await req.json();
    const action = body?.action;
    const kind = body?.kind;
    if (action === "presign") {
      if (kind !== "photo" && kind !== "resume") {
        return NextResponse.json({ error: "Invalid upload kind" }, { status: 400 });
      }
      const filename = String(body?.filename || "");
      const size = Number(body?.size || 0);
      const contentType = String(body?.contentType || "application/octet-stream");
      const ext = path.extname(filename).toLowerCase();
      if (!allowed[kind].includes(ext)) {
        return NextResponse.json(
          { error: `Invalid ${kind} type: ${ext || "unknown"}` },
          { status: 400 }
        );
      }
      if (size > maxBytes) {
        return NextResponse.json(
          { error: "File too large. Max size is 5 MB." },
          { status: 413 }
        );
      }

      const bucket = kind === "photo" ? photoBucket : resumeBucket;
      const objectKey = `members/${rollNo}/${kind}${ext}`;
      const uploadUrl = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
        }),
        { expiresIn: 300 }
      );
      const baseUrl = resolvedEndpoint?.replace(/\/$/, "") ?? "";
      const publicUrl = `${baseUrl}/${bucket}/${encodeURIComponent(
        objectKey
      ).replace(/%2F/g, "/")}`;
      return NextResponse.json(
        { uploadUrl, key: objectKey, bucket, publicUrl },
        { status: 200 }
      );
    }

    if (action === "complete") {
      if (kind !== "photo" && kind !== "resume") {
        return NextResponse.json({ error: "Invalid upload kind" }, { status: 400 });
      }
      const key = String(body?.key || "");
      if (!key.startsWith(`members/${rollNo}/`)) {
        return NextResponse.json({ error: "Invalid upload key" }, { status: 400 });
      }
      const bucket = kind === "photo" ? photoBucket : resumeBucket;
      const baseUrl = resolvedEndpoint?.replace(/\/$/, "") ?? "";
      const publicUrl = `${baseUrl}/${bucket}/${encodeURIComponent(key).replace(
        /%2F/g,
        "/"
      )}`;
      if (kind === "photo") {
        update.profilePicUrl = publicUrl;
      } else {
        update.resumeUrl = publicUrl;
      }
      await Member.findOneAndUpdate({ clerkId }, update);
      return NextResponse.json({ [kind]: publicUrl }, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid upload action" }, { status: 400 });
  }

  const form = await req.formData();
  for (const key of ["photo", "resume"] as const) {
    const file = form.get(key);
    if (!(file instanceof File)) continue;

    if (file.size > maxBytes) {
      logger.warn({ clerkId, key, size: file.size }, "File too large");
      return NextResponse.json(
        { error: "File too large. Max size is 5 MB." },
        { status: 413 }
      );
    }

    const bucket = key === "photo" ? photoBucket : resumeBucket;

    // Validate extension
    const ext = path.extname(file.name).toLowerCase();
    if (!allowed[key].includes(ext)) {
      logger.warn({ clerkId, key, ext }, "Invalid file extension");
      return NextResponse.json(
        { error: `Invalid ${key} type: ${ext}` },
        { status: 400 }
      );
    }

    const objectKey =
      key === "photo"
        ? `members/${rollNo}/photo${ext}`
        : `members/${rollNo}/resume${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "application/octet-stream";
    const sendPutObject = async (client: S3Client) =>
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: contentType,
          ContentLength: buffer.length,
        })
      );

    try {
      await sendPutObject(s3);
    } catch (err: any) {
      const responseDate = err?.$response?.headers?.date;
      const status = err?.$metadata?.httpStatusCode ?? 500;
      const message =
        err?.message ||
        err?.name ||
        "Upload failed while writing to storage";
      logger.error(
        { err, clerkId, key, bucket, objectKey, responseDate },
        "S3 upload failed"
      );

      const shouldRetry =
        message.includes("Authorization header malformed") ||
        message.includes("unexpected scope");
      if (shouldRetry) {
        let offset = 0;
        if (responseDate && typeof responseDate === "string") {
          const serverMs = new Date(responseDate).getTime();
          if (!Number.isNaN(serverMs)) {
            offset = serverMs - Date.now();
          }
        }

        const candidateRegions = [
          signingRegion,
          "garage",
          "auto",
          "us-east-1",
        ];
        const tried = new Set<string>();
        let lastError: any = err;
        for (const region of candidateRegions) {
          if (!region || tried.has(region)) continue;
          tried.add(region);
          const retryClient = buildS3Client(offset, region);
          if (!retryClient) continue;
          try {
            logger.warn(
              { clerkId, key, bucket, objectKey, region },
              "Retrying S3 upload with alternate signing region"
            );
            await sendPutObject(retryClient);
            lastError = null;
            break;
          } catch (retryErr: any) {
            lastError = retryErr;
            logger.error(
              { err: retryErr, clerkId, key, bucket, objectKey, region },
              "S3 upload retry failed"
            );
          }
        }

        if (!lastError) {
          // retry succeeded
        } else {
          const retryStatus = lastError?.$metadata?.httpStatusCode ?? status;
          const retryMessage =
            lastError?.message ||
            lastError?.name ||
            message;
          return NextResponse.json(
            { error: retryMessage },
            { status: retryStatus }
          );
        }
      } else {
        return NextResponse.json({ error: message }, { status });
      }
    }

    const baseUrl = resolvedEndpoint?.replace(/\/$/, "") ?? "";
    const url = `${baseUrl}/${bucket}/${encodeURIComponent(objectKey).replace(
      /%2F/g,
      "/"
    )}`;
    out[key] = url;
    logger.info({ clerkId, key, bucket, objectKey }, `Uploaded ${key}`);

    // Prepare Mongo update
    if (key === "photo") {
      update.profilePicUrl = url;
    } else {
      update.resumeUrl = url;
    }
  }

  // Apply updates to Member document
  if (Object.keys(update).length > 0) {
    await Member.findOneAndUpdate({ clerkId }, update);
    logger.info({ clerkId, update }, "Member document fields updated");
  }

  logger.info({ clerkId, out }, "Upload handler completed");
  return NextResponse.json(out, { status: 200 });
}

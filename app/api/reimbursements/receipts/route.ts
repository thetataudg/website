// app/api/reimbursements/receipts/route.ts
// Receipt images for reimbursement claims.
//
// Separate from `/api/upload-file` on purpose. That route stores exactly one
// photo and one resume per member at fixed object keys and deletes anything
// else it finds — correct for a profile picture, wrong for receipts, where a
// member attaches several and every one has to survive. Teaching it a third
// shape would have put the profile-photo path at risk for no gain.
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const garageEndpointRaw = process.env.NEXT_PUBLIC_GARAGE_ENDPOINT;
const garageRegion = process.env.NEXT_PUBLIC_GARAGE_REGION;
const garageAccessKey = process.env.GARAGE_ACCESS_KEY;
const garageSecretKey = process.env.GARAGE_SECRET_KEY;
const garageUseSSL = process.env.GARAGE_USE_SSL;

/// Falls back to the photo bucket so this works against the storage that is
/// already configured. Set `S3_RECEIPT_BUCKET` to give receipts their own
/// bucket — financial records and profile pictures having different retention
/// and access rules is the kind of thing an auditor asks about.
const receiptBucket = process.env.S3_RECEIPT_BUCKET || process.env.S3_PHOTO_BUCKET;

const resolvedEndpoint =
  garageEndpointRaw && !garageEndpointRaw.startsWith("http")
    ? `${garageUseSSL === "false" ? "http" : "https"}://${garageEndpointRaw}`
    : garageEndpointRaw;

const ALLOWED = [".jpg", ".jpeg", ".png", ".heic", ".webp", ".pdf"];
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  let clerkId: string;
  try {
    clerkId = await requireAuth(req as any);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode ?? 401 });
  }

  if (!resolvedEndpoint || !garageAccessKey || !garageSecretKey || !receiptBucket) {
    logger.error("Receipt storage is not configured");
    return NextResponse.json(
      { error: "Receipt uploads aren't set up on this server yet" },
      { status: 503 }
    );
  }

  try {
    await connectDB();
    const member = await Member.findOne({ clerkId }).select("rollNo").lean<any>();
    if (!member) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const form = await req.formData();
    const file = form.get("receipt");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No receipt attached" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "That file is too large. Receipts can be up to 8 MB." },
        { status: 413 }
      );
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED.includes(ext)) {
      return NextResponse.json(
        { error: `Receipts can be images or PDFs, and ${ext || "that"} isn't one` },
        { status: 400 }
      );
    }

    // A unique key per file: a member attaches several receipts to one claim,
    // and claims accumulate across years.
    const objectKey = `receipts/${member.rollNo}/${randomUUID()}${ext}`;

    const s3 = new S3Client({
      region: garageRegion || "garage",
      endpoint: resolvedEndpoint,
      credentials: {
        accessKeyId: garageAccessKey,
        secretAccessKey: garageSecretKey,
      },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: receiptBucket,
        Key: objectKey,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type || "application/octet-stream",
      })
    );

    const baseUrl = resolvedEndpoint.replace(/\/$/, "");
    const url = `${baseUrl}/${receiptBucket}/${encodeURIComponent(objectKey).replace(/%2F/g, "/")}`;

    logger.info({ rollNo: member.rollNo, objectKey }, "Receipt uploaded");
    return NextResponse.json({ url, key: objectKey }, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to upload receipt");
    return NextResponse.json(
      { error: "Couldn't save that receipt. Try again." },
      { status: 500 }
    );
  }
}

// app/api/uploads/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import logger from "@/lib/logger";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

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

  // Ensure our base directories exist
  const baseDir = path.join(process.cwd(), "public", "files", rollNo);
  const photosDir = path.join(baseDir, "photos");
  const resumesDir = path.join(baseDir, "resumes");
  await fs.promises.mkdir(photosDir, { recursive: true });
  await fs.promises.mkdir(resumesDir, { recursive: true });
  logger.info({ clerkId, rollNo }, "Upload directories ensured");

  const form = await req.formData();
  const out: Record<string, string> = {};
  const update: Partial<{ profilePicUrl: string; resumeUrl: string }> = {};
  const allowed = {
    photo: [".jpg", ".jpeg", ".png"],
    resume: [".pdf", ".doc", ".docx"],
  };

  for (const key of ["photo", "resume"] as const) {
    const file = form.get(key);
    if (!(file instanceof File)) continue;

    const destDir = key === "photo" ? photosDir : resumesDir;

    // --- CLEAR existing files in this folder ---
    try {
      const existing = await fs.promises.readdir(destDir);
      await Promise.all(
        existing.map((fname) => fs.promises.unlink(path.join(destDir, fname)))
      );
      logger.info(
        { clerkId, key, cleared: existing.length },
        "Cleared old files"
      );
    } catch (err: any) {
      logger.warn(
        { err, clerkId, key },
        "Failed to clear old files, continuing"
      );
    }

    // Validate extension
    const ext = path.extname(file.name).toLowerCase();
    if (!allowed[key].includes(ext)) {
      logger.warn({ clerkId, key, ext }, "Invalid file extension");
      return NextResponse.json(
        { error: `Invalid ${key} type: ${ext}` },
        { status: 400 }
      );
    }

    // Write new file
    const filename = `${Date.now()}_${rollNo}${ext}`;
    const filePath = path.join(destDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.promises.writeFile(filePath, buffer);

    const url = `/files/${rollNo}/${
      key === "photo" ? "photos" : "resumes"
    }/${filename}`;
    out[key] = url;
    logger.info({ clerkId, key, filePath }, `Wrote uploaded ${key}`);

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

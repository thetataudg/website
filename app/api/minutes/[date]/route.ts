import path from "path";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Minute from "@/lib/models/Minute";
import Event from "@/lib/models/Event";
import logger from "@/lib/logger";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  buildMinutesS3Client,
  getMinutesBucket,
  getMinutesPublicUrl,
  getMinutesSigningRegion,
  resolveMinutesClockOffset,
  getSignedMinutesUrl,
} from "@/lib/minutesStorage";
import {
  buildMeetingDateRangeFromKey,
  formatMeetingDateKey,
} from "@/lib/minutes";

const maxFileBytes = 20 * 1024 * 1024;
const minutesBucket = getMinutesBucket();

const isAdminOrScribe = (member: any) =>
  member &&
  (member.role === "admin" ||
    member.role === "superadmin" ||
    (member.isECouncil &&
      typeof member.ecouncilPosition === "string" &&
      member.ecouncilPosition.toLowerCase() === "scribe"));

const buildClient = async () => {
  const signingRegion = getMinutesSigningRegion();
  const client = buildMinutesS3Client(
    await resolveMinutesClockOffset(),
    signingRegion
  );
  return { client, signingRegion };
};

const findMinuteForSlug = async (slug: string) => {
  if (!slug) return null;
  const matched = await Minute.findOne({ meetingDateKey: slug });
  if (matched) return matched;
  const range = buildMeetingDateRangeFromKey(slug);
  if (!range) return null;
  return await Minute.findOne({
    meetingDate: { $gte: range.start, $lt: range.end },
  });
};

const sanitizeFileName = (name: string) =>
  name
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

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

const uploadMinutesFile = async (file: FileLike, slug: string) => {
  if (!minutesBucket) throw new Error("Minutes bucket not configured");
  if (file.size > maxFileBytes) {
    throw new Error("File too large");
  }
  const ext = path.extname(file.name || "").toLowerCase();
  if (ext !== ".pdf") {
    throw new Error("Invalid file type");
  }
  const { client } = await buildClient();
  if (!client) {
    throw new Error("Storage client unavailable");
  }
  const sanitized = sanitizeFileName(file.name || "minutes.pdf");
  const key = `minutes/${slug}/${Date.now()}-${sanitized}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await client.send(
    new PutObjectCommand({
      Bucket: minutesBucket,
      Key: key,
      Body: buffer,
      ContentType: file.type || "application/pdf",
      ContentLength: buffer.length,
    })
  );
  return { key, url: getMinutesPublicUrl(key) };
};

const enrichWithSignedUrl = async (minute: any) => {
  if (!minute) return minute;
  const payload = minute.toObject ? minute.toObject() : minute;
  payload.minutesUrl = await getSignedMinutesUrl(minute.minutesKey);
  if (payload.eventId && payload.eventId.toString) {
    payload.eventId = payload.eventId.toString();
  }
  return payload;
};

const deleteMinutesFile = async (key?: string) => {
  if (!key || !minutesBucket) return;
  const { client } = await buildClient();
  if (!client) return;
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: minutesBucket,
        Key: key,
      })
    );
  } catch (err: any) {
    logger.warn({ err, key }, "Failed to delete minutes file");
  }
};

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: { date: string } }
) {
  try {
    const clerkId = await requireAuth(req as any);
    await connectDB();
    const member = await Member.findOne({ clerkId }).lean();
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const minute = await findMinuteForSlug(params.date);
    if (!minute || (minute.hidden && !isAdminOrScribe(member))) {
      return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
    }

    const enriched = await enrichWithSignedUrl(minute);
    return NextResponse.json(enriched, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to load minutes");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { date: string } }
) {
  try {
    const clerkId = await requireAuth(req as any);
    await connectDB();
    const member = await Member.findOne({ clerkId });
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (!isAdminOrScribe(member)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const minute = await findMinuteForSlug(params.date);
    if (!minute) {
      return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
    }

    const contentType = req.headers.get("content-type") || "";
    let payload: any = {};
    let uploadedFile: FileLike | null = null;
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      payload.startTime = String(form.get("startTime") || "");
      payload.endTime = String(form.get("endTime") || "");
      payload.activesPresent = String(form.get("activesPresent") || "");
      payload.quorumRequired = form.get("quorumRequired");
      payload.hidden = form.get("hidden");
      payload.executiveSummary = String(form.get("executiveSummary") || "");
      payload.eventId = form.get("eventId");
      const maybeFile = form.get("minutesFile");
      if (isFileLike(maybeFile)) {
        uploadedFile = maybeFile;
      }
    } else {
      payload = await req.json();
    }

    const updates: any = {};
    if (payload.startTime) {
      const parsed = new Date(String(payload.startTime));
      if (!Number.isNaN(parsed.getTime())) {
        updates.startTime = parsed;
        const meetingDate = new Date(parsed);
        meetingDate.setHours(0, 0, 0, 0);
        updates.meetingDate = meetingDate;
        updates.meetingDateKey = formatMeetingDateKey(parsed);
      }
    }
    if (payload.endTime) {
      const parsed = new Date(String(payload.endTime));
      if (!Number.isNaN(parsed.getTime())) {
        updates.endTime = parsed;
      }
    }
    if (payload.activesPresent !== undefined) {
      const parsed = Number(payload.activesPresent);
      if (!Number.isNaN(parsed)) {
        updates.activesPresent = parsed;
      }
    }
    if (payload.executiveSummary !== undefined) {
      const trimmed = String(payload.executiveSummary).trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "Executive summary cannot be empty" },
          { status: 400 }
        );
      }
      updates.executiveSummary = trimmed;
    }
    if (payload.quorumRequired !== undefined) {
      const value =
        String(payload.quorumRequired).toLowerCase() === "true" ||
        String(payload.quorumRequired).toLowerCase() === "yes";
      updates.quorumRequired = value;
    }
    if (payload.eventId !== undefined) {
      const candidate = String(payload.eventId || "").trim();
      if (candidate) {
        const linkedEvent = await Event.findById(candidate).lean<{
          _id?: typeof Minute["prototype"]["eventId"];
          name?: string;
        }>();
        if (!linkedEvent) {
          return NextResponse.json(
            { error: "Linked event not found" },
            { status: 404 }
          );
        }
        updates.eventId = linkedEvent._id;
        updates.eventName = linkedEvent.name;
      } else {
        updates.eventId = null;
        updates.eventName = "";
      }
    }
    if (payload.hidden !== undefined) {
      updates.hidden =
        String(payload.hidden).toLowerCase() === "true" ||
        String(payload.hidden).toLowerCase() === "yes";
    }

    if (uploadedFile && uploadedFile.size) {
      if (!minutesBucket) {
        return NextResponse.json(
          { error: "Minutes storage is not configured" },
          { status: 500 }
        );
      }
      const cleanedSlug =
        updates.meetingDateKey ||
        minute.meetingDateKey ||
        minute.meetingDate.toISOString().split("T")[0];
      const { key, url } = await uploadMinutesFile(uploadedFile, cleanedSlug);
      updates.minutesUrl = url;
      updates.minutesKey = key;
      await deleteMinutesFile(minute.minutesKey);
    }

    await Minute.findByIdAndUpdate(minute._id, updates, {
      runValidators: true,
    });
    const refreshed = await Minute.findById(minute._id);
    const enriched = await enrichWithSignedUrl(refreshed);
    return NextResponse.json(enriched, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to update minutes");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { date: string } }
) {
  try {
    const clerkId = await requireAuth(req as any);
    await connectDB();
    const member = await Member.findOne({ clerkId });
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (!isAdminOrScribe(member)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const minute = await findMinuteForSlug(params.date);
    if (!minute) {
      return NextResponse.json({ error: "Minutes not found" }, { status: 404 });
    }

    if (minute.minutesKey) {
      await deleteMinutesFile(minute.minutesKey);
    }
    await Minute.deleteOne({ _id: minute._id });

    return NextResponse.json({ status: "deleted" }, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to delete minutes");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

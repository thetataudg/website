import path from "path";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/clerk";
import { connectDB } from "@/lib/db";
import Member from "@/lib/models/Member";
import Minute from "@/lib/models/Minute";
import Event from "@/lib/models/Event";
import logger from "@/lib/logger";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  buildMinutesS3Client,
  getMinutesBucket,
  getMinutesPublicUrl,
  getMinutesSigningRegion,
  resolveMinutesClockOffset,
  getSignedMinutesUrl,
} from "@/lib/minutesStorage";
import { formatMeetingDateKey } from "@/lib/minutes";

const isAdminOrScribe = (member: any) =>
  member &&
  (member.role === "admin" ||
    member.role === "superadmin" ||
    (member.isECouncil &&
      typeof member.ecouncilPosition === "string" &&
      member.ecouncilPosition.toLowerCase() === "scribe"));

const maxFileBytes = 20 * 1024 * 1024;
const minutesBucketValue = getMinutesBucket();

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const clerkId = await requireAuth(req as any);
    await connectDB();
    const member = await Member.findOne({ clerkId }).lean();
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const includeHidden = url.searchParams.get("includeHidden") === "true";
    const canViewHidden = includeHidden && isAdminOrScribe(member);
    const filter: any = {};
    if (!canViewHidden) {
      filter.hidden = false;
    }

    const minutes = await Minute.find(filter)
      .sort({ meetingDate: -1 })
      .lean();
    const minutesWithSignedUrl = await Promise.all(
      minutes.map(async (minute: any) => {
        const base = {
          ...minute,
          minutesUrl: await getSignedMinutesUrl(minute.minutesKey),
        };
        if (base.eventId && typeof base.eventId.toString === "function") {
          base.eventId = base.eventId.toString();
        }
        return base;
      })
    );
    return NextResponse.json(minutesWithSignedUrl, { status: 200 });
  } catch (err: any) {
    logger.error({ err }, "Failed to list minutes");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

export async function POST(req: Request) {
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

    if (!minutesBucketValue) {
      return NextResponse.json(
        { error: "Minutes storage is not configured" },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const startRaw = String(form.get("startTime") || "");
    const endRaw = String(form.get("endTime") || "");
    const activesRaw = String(form.get("activesPresent") || "");
    const quorumRaw = String(form.get("quorumRequired") || "").toLowerCase();
    const summaryRaw = String(form.get("executiveSummary") || "").trim();
    const eventIdRaw = String(form.get("eventId") || "").trim();
    const file = form.get("minutesFile");

    if (!startRaw || !endRaw || !activesRaw) {
      return NextResponse.json(
        { error: "startTime, endTime and activesPresent are required" },
        { status: 400 }
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Minutes file must be provided" },
        { status: 400 }
      );
    }

    const ext = path.extname(file.name || "").toLowerCase();
    if (ext !== ".pdf") {
      return NextResponse.json(
        { error: "Minutes file must be a PDF" },
        { status: 400 }
      );
    }

    if (file.size > maxFileBytes) {
      return NextResponse.json(
        { error: "File too large. Max size is 20 MB." },
        { status: 413 }
      );
    }

    const startTime = new Date(startRaw);
    const endTime = new Date(endRaw);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      return NextResponse.json(
        { error: "Invalid start or end time" },
        { status: 400 }
      );
    }

    if (endTime <= startTime) {
      return NextResponse.json(
        { error: "End time must be after start time" },
        { status: 400 }
      );
    }

    const activesPresent = Number(activesRaw);
    if (Number.isNaN(activesPresent) || activesPresent < 0) {
      return NextResponse.json(
        { error: "Invalid actives present count" },
        { status: 400 }
      );
    }

    const quorumRequired = quorumRaw === "true" || quorumRaw === "yes";

    if (!summaryRaw) {
      return NextResponse.json(
        { error: "Executive summary is required" },
        { status: 400 }
      );
    }

    let eventName = "";
    let linkedEventId: typeof Minute["prototype"]["eventId"] = null;
    if (eventIdRaw) {
      const foundEvent = await Event.findById(eventIdRaw)
        .lean<{ name?: string; _id?: typeof Minute["prototype"]["eventId"] }>();
      if (!foundEvent) {
        return NextResponse.json(
          { error: "Linked event not found" },
          { status: 404 }
        );
      }
      linkedEventId = foundEvent._id;
      eventName = foundEvent.name || "";
    }

    const meetingDate = new Date(startTime);
    meetingDate.setHours(0, 0, 0, 0);
    const slug = formatMeetingDateKey(new Date(startTime));

    const signingRegion = getMinutesSigningRegion();
    const client = buildMinutesS3Client(
      await resolveMinutesClockOffset(),
      signingRegion
    );
    if (!client) {
      return NextResponse.json(
        { error: "Minutes storage is not configured" },
        { status: 500 }
      );
    }

    const sanitizedName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const objectKey = `minutes/${slug}/${Date.now()}-${sanitizedName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await client.send(
      new PutObjectCommand({
        Bucket: minutesBucketValue,
        Key: objectKey,
        Body: buffer,
        ContentType: file.type || "application/pdf",
        ContentLength: buffer.length,
      })
    );

    const minutesUrl = getMinutesPublicUrl(objectKey);
    const created = await Minute.create({
      meetingDate,
      startTime,
      endTime,
      activesPresent,
      quorumRequired,
      executiveSummary: summaryRaw,
      eventId: linkedEventId,
      eventName,
      minutesUrl,
      minutesKey: objectKey,
      meetingDateKey: slug,
      createdBy: member._id,
      hidden: false,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    logger.error({ err }, "Failed to create minutes");
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}

import fs from "fs";
import path from "path";
import { calendar_v3, google } from "googleapis";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import Event from "@/lib/models/Event";
import logger from "@/lib/logger";

const CALENDAR_SCOPE = ["https://www.googleapis.com/auth/calendar"];
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || "UTC";
const DEFAULT_S3_BUCKET =
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_S3_BUCKET ||
  process.env.S3_RESUME_BUCKET ||
  "dg-secrets";
const DEFAULT_S3_KEY = "calendarr.json";
const garageEndpointRaw = process.env.NEXT_PUBLIC_GARAGE_ENDPOINT;
const garageRegion = process.env.NEXT_PUBLIC_GARAGE_REGION || "";
const garageAccessKey = process.env.GARAGE_ACCESS_KEY;
const garageSecretKey = process.env.GARAGE_SECRET_KEY;
const garageUseSSL = process.env.GARAGE_USE_SSL;

const isAwsEndpoint = (endpoint?: string) =>
  !!endpoint && endpoint.toLowerCase().includes("amazonaws.com");

const garageSigningRegion =
  process.env.GARAGE_SIGNING_REGION ||
  ((isAwsEndpoint(garageEndpointRaw) ? garageRegion : "garage") ||
    process.env.AWS_REGION);

const resolvedGarageEndpoint =
  garageEndpointRaw && !garageEndpointRaw.startsWith("http")
    ? `${garageUseSSL === "false" ? "http" : "https"}://${garageEndpointRaw}`
    : garageEndpointRaw;

type CalendarSyncResult = {
  eventId: string;
  status: "synced" | "skipped" | "error";
  calendarEventId?: string | null;
  reason?: string;
};

let cachedCalendar: calendar_v3.Calendar | null = null;
let cachedCredentials: any | null = null;
let credentialsLoadPromise: Promise<any | null> | null = null;

function tryParseServiceAccount(raw: string) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch (decodeErr) {
      logger.error(
        { err: decodeErr },
        "Failed to parse Google service account credentials"
      );
      return null;
    }
  }
}

function streamToString(stream: any) {
  return new Promise<string>((resolve, reject) => {
    if (typeof stream === "string") return resolve(stream);
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

function buildGarageS3Client() {
  if (!garageAccessKey || !garageSecretKey) return null;
  const options: any = {
    credentials: {
      accessKeyId: garageAccessKey,
      secretAccessKey: garageSecretKey,
    },
    forcePathStyle: Boolean(resolvedGarageEndpoint),
  };
  if (resolvedGarageEndpoint) {
    options.endpoint = resolvedGarageEndpoint;
  }
  if (garageSigningRegion) {
    options.region = garageSigningRegion;
  }
  return new S3Client(options);
}

async function fetchServiceAccountFromS3(
  bucket: string,
  key: string,
  region?: string
) {
  if (!bucket || !key) return null;
  const garageClient = buildGarageS3Client();
  const client = garageClient || new S3Client(region ? { region } : {});
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await client.send(command);
  if (!response.Body) return null;
  const contents = await streamToString(response.Body);
  return tryParseServiceAccount(contents);
}

async function loadServiceAccount() {
  if (cachedCredentials) return cachedCredentials;
  if (credentialsLoadPromise) return credentialsLoadPromise;

  credentialsLoadPromise = (async () => {
    let credentials: any = null;

    const bucket =
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_S3_BUCKET ||
      process.env.S3_RESUME_BUCKET ||
      DEFAULT_S3_BUCKET;
    const key =
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_S3_KEY ||
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_S3_OBJECT ||
      DEFAULT_S3_KEY;
    const region =
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_S3_REGION || process.env.S3_REGION;

    try {
      credentials = await fetchServiceAccountFromS3(bucket, key, region);
    } catch (err) {
      logger.warn({ err, bucket, key }, "Failed to fetch calendar JSON from S3");
    }

    if (!credentials) {
      const relativePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
      if (relativePath) {
        try {
          const resolved = path.isAbsolute(relativePath)
            ? relativePath
            : path.resolve(process.cwd(), relativePath);
          const contents = fs.readFileSync(resolved, "utf8");
          credentials = tryParseServiceAccount(contents);
        } catch (err) {
          logger.warn(
            { err, relativePath },
            "Unable to read service account file from fallback path"
          );
        }
      }
    }

    return credentials;
  })();

  cachedCredentials = await credentialsLoadPromise;
  return cachedCredentials;
}

async function getCalendarClient() {
  if (!CALENDAR_ID) {
    logger.warn("Google Calendar ID is not configured, calendar sync disabled");
    return null;
  }
  if (cachedCalendar) return cachedCalendar;

  const credentials = await loadServiceAccount();
  if (!credentials) {
    logger.warn(
      "Google service account credentials missing, calendar sync disabled"
    );
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: CALENDAR_SCOPE,
  });

  cachedCalendar = google.calendar({ version: "v3", auth });
  return cachedCalendar;
}

function buildCalendarBody(event: any): calendar_v3.Schema$Event | null {
  if (!event?.startTime || !event?.endTime) return null;
  const startDate = new Date(event.startTime);
  const endDate = new Date(event.endTime);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  if (startDate >= endDate) {
    logger.warn(
      { eventId: event?._id, start: event.startTime, end: event.endTime },
      "Event start time is not before end time, skipping calendar sync"
    );
    return null;
  }

  const body: calendar_v3.Schema$Event = {
    summary: event.name || "Event",
    description: event.description || "",
    location: event.location || "",
    start: {
      dateTime: startDate.toISOString(),
      timeZone: TIMEZONE,
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: TIMEZONE,
    },
  };

  if (event.status === "cancelled") {
    body.status = "cancelled";
  }

  return body;
}

function isNotFoundError(err: any) {
  return err?.code === 404 || err?.response?.status === 404;
}

export async function syncEventWithCalendar(event: any): Promise<CalendarSyncResult> {
  if (!event?._id) {
    return { eventId: "unknown", status: "skipped", reason: "Missing event id" };
  }
  const calendar = await getCalendarClient();
  if (!calendar) {
    return {
      eventId: event._id.toString(),
      status: "skipped",
      reason: "Calendar client unavailable",
    };
  }

  const calendarId = CALENDAR_ID;
  if (!calendarId) {
    return {
      eventId: event._id.toString(),
      status: "skipped",
      reason: "Calendar ID not configured",
    };
  }

  const body = buildCalendarBody(event);
  if (!body) {
    return {
      eventId: event._id.toString(),
      status: "skipped",
      reason: "StartTime or endTime invalid",
    };
  }

  const eventId = event._id.toString();
  let remoteId = event.calendarEventId;
  let response: calendar_v3.Schema$Event | null = null;

  if (remoteId) {
    try {
      const updateRes = await calendar.events.update({
        calendarId,
        eventId: remoteId,
        requestBody: body,
      });
      response = updateRes.data;
    } catch (err: any) {
      if (isNotFoundError(err)) {
        remoteId = undefined;
      } else {
        const reason = err?.message || "Unknown update error";
        logger.error({ err, eventId }, "Failed to update Google Calendar event");
        return { eventId, status: "error", reason };
      }
    }
  }

  if (!remoteId) {
    try {
      const insertRes = await calendar.events.insert({
        calendarId,
        requestBody: body,
      });
      response = insertRes.data;
      remoteId = response?.id;
    } catch (err: any) {
      const reason = err?.message || "Unknown insert error";
      logger.error({ err, eventId }, "Failed to create Google Calendar event");
      return { eventId, status: "error", reason };
    }
  }

  const calendarEventId = response?.id || remoteId;
  if (calendarEventId) {
    await Event.updateOne(
      { _id: event._id },
      { $set: { calendarEventId } },
      { runValidators: false }
    );
  }

  return {
    eventId,
    status: "synced",
    calendarEventId,
  };
}

export async function deleteCalendarEvent(event: any | string) {
  const calendar = await getCalendarClient();
  if (!calendar) return;

  const calendarId = CALENDAR_ID;
  if (!calendarId) return;

  const entryId =
    typeof event === "string"
      ? event
      : event?.calendarEventId
      ? event.calendarEventId
      : null;
  if (!entryId) return;

  try {
    await calendar.events.delete({
      calendarId,
      eventId: entryId,
    });
  } catch (err: any) {
    if (isNotFoundError(err)) {
      return;
    }
    logger.error({ err, eventId: entryId }, "Failed to delete Google Calendar event");
  }
}

export async function syncAllEvents(): Promise<CalendarSyncResult[]> {
  const events = await Event.find().lean();
  const outcomes: CalendarSyncResult[] = [];
  for (const evt of events) {
    const result = await syncEventWithCalendar(evt);
    outcomes.push(result);
  }
  return outcomes;
}

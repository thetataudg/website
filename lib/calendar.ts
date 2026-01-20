import fs from "fs";
import path from "path";
import { calendar_v3, google } from "googleapis";
import Event from "@/lib/models/Event";
import logger from "@/lib/logger";

const CALENDAR_SCOPE = ["https://www.googleapis.com/auth/calendar"];
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || "UTC";
const GENERATED_SERVICE_ACCOUNT_PATH = path.join(
  process.cwd(),
  "netlify",
  "generated",
  "google-service-account.json"
);

type CalendarSyncResult = {
  eventId: string;
  status: "synced" | "skipped" | "error";
  calendarEventId?: string | null;
  reason?: string;
};

let cachedCalendar: calendar_v3.Calendar | null = null;

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

function loadServiceAccount() {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (inline) {
    return tryParseServiceAccount(inline);
  }
  const relativePath =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || GENERATED_SERVICE_ACCOUNT_PATH;
  if (relativePath) {
    try {
      const resolved = path.isAbsolute(relativePath)
        ? relativePath
        : path.resolve(process.cwd(), relativePath);
      const contents = fs.readFileSync(resolved, "utf8");
      return tryParseServiceAccount(contents);
    } catch (err) {
      logger.error({ err, relativePath }, "Unable to read service account file");
    }
  }
  return null;
}

function getCalendarClient() {
  if (!CALENDAR_ID) {
    logger.warn("Google Calendar ID is not configured, calendar sync disabled");
    return null;
  }
  if (cachedCalendar) return cachedCalendar;

  const credentials = loadServiceAccount();
  if (!credentials) {
    logger.warn("Google service account credentials missing, calendar sync disabled");
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
  const calendar = getCalendarClient();
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
  const calendar = getCalendarClient();
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

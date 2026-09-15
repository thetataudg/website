// lib/airtable.ts
//
// Reads the chapter's member roster out of Airtable.
//
// Plain `fetch` rather than the `airtable` npm package: the whole surface
// needed here is one paginated GET, and the package brings its own retry,
// pagination and fetch-shim machinery that has to be talked out of the way
// under Next.js for no gain.

export class AirtableError extends Error {
  constructor(message: string, readonly statusCode = 502) {
    super(message);
    this.name = "AirtableError";
  }
}

export interface AirtableMemberRow {
  /** Airtable record id, `rec...`. */
  id: string;
  /** Roll number, stringified and trimmed. */
  roll: string;
  name: string;
  /** Exactly what the cell held. Normalization happens at the plan layer. */
  phoneRaw: string;
}

type AirtableConfig = {
  pat: string;
  baseId: string;
  table: string;
  rollField: string;
  nameField: string;
  phoneField: string;
};

/** Null when the integration is not configured, so callers can 503 cleanly. */
export function airtableConfig(): AirtableConfig | null {
  const pat = process.env.AIRTABLE_PAT || "";
  const baseId = process.env.AIRTABLE_BASE_ID || "";
  if (!pat || !baseId) return null;
  return {
    pat,
    baseId,
    table: process.env.AIRTABLE_MEMBERS_TABLE || "Members",
    rollField: process.env.AIRTABLE_ROLL_FIELD || "Roll",
    nameField: process.env.AIRTABLE_NAME_FIELD || "Name",
    phoneField: process.env.AIRTABLE_PHONE_FIELD || "Phone Number",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Airtable hands back a Number for a numeric column; some bases prefix "#". */
function readRoll(value: unknown): string {
  return String(value ?? "").trim().replace(/^#/, "");
}

export interface AirtableEmailRow {
  roll: string;
  /** Lowercased, trimmed, or "" when the cell is blank. */
  personal: string;
  asu: string;
}

/// Every member's personal and ASU email, keyed by roll number.
///
/// Feeds the Google Groups sync, which mails actives at their ASU address and
/// alumni at their personal one. Same guard as the phone read: a column name
/// that doesn't match comes back as blank on every row, which would read as
/// "nobody has an email" and empty the groups, so a missing column throws.
export async function fetchAirtableEmails(): Promise<Map<string, AirtableEmailRow>> {
  const config = airtableConfig();
  if (!config) {
    throw new AirtableError("Airtable isn't configured on this server.", 503);
  }
  const personalField = process.env.AIRTABLE_PERSONAL_EMAIL_FIELD || "Personal Email";
  const asuField = process.env.AIRTABLE_ASU_EMAIL_FIELD || "ASU Email";
  const endpoint = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.table)}`;
  const rows = new Map<string, AirtableEmailRow>();
  const seen = { personal: false, asu: false };
  let offset: string | undefined;
  let pages = 0;
  let records = 0;

  do {
    const url = new URL(endpoint);
    url.searchParams.set("pageSize", "100");
    for (const field of [config.rollField, personalField, asuField]) {
      url.searchParams.append("fields[]", field);
    }
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.pat}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new AirtableError(`Airtable returned ${res.status} while reading member emails.`);
    }
    const json = (await res.json()) as {
      records?: Array<{ id: string; fields?: Record<string, unknown> }>;
      offset?: string;
    };

    for (const record of json.records ?? []) {
      records += 1;
      const fields = record.fields ?? {};
      if (personalField in fields) seen.personal = true;
      if (asuField in fields) seen.asu = true;
      const roll = readRoll(fields[config.rollField]);
      if (!roll) continue;
      rows.set(roll, {
        roll,
        personal: String(fields[personalField] ?? "").trim().toLowerCase(),
        asu: String(fields[asuField] ?? "").trim().toLowerCase(),
      });
    }

    offset = json.offset;
    pages += 1;
    if (offset) await sleep(250);
  } while (offset && pages < 200);

  if (records > 0 && (!seen.personal || !seen.asu)) {
    throw new AirtableError(
      `Airtable returned no "${!seen.personal ? personalField : asuField}" column. Check the column name in the base; it is case and space sensitive.`,
      502
    );
  }
  return rows;
}

export async function fetchAirtableMembers(): Promise<AirtableMemberRow[]> {
  const config = airtableConfig();
  if (!config) {
    throw new AirtableError("Airtable isn't configured on this server.", 503);
  }

  const endpoint = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.table)}`;
  const rows: AirtableMemberRow[] = [];
  let offset: string | undefined;
  let sawPhoneKey = false;
  let pages = 0;

  do {
    const url = new URL(endpoint);
    url.searchParams.set("pageSize", "100");
    // Only the three columns needed. A Members table also holds addresses and
    // attachments, and there is no reason to pull several hundred rows of them.
    for (const field of [config.rollField, config.nameField, config.phoneField]) {
      url.searchParams.append("fields[]", field);
    }
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.pat}` },
      cache: "no-store",
    });

    if (res.status === 429) {
      throw new AirtableError(
        "Airtable is rate-limiting this base. Wait about 30 seconds and try again.",
        429
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new AirtableError(
        "Airtable rejected the access token. Check AIRTABLE_PAT and that it is granted to this base.",
        502
      );
    }
    if (res.status === 404) {
      throw new AirtableError(
        `Airtable has no table named "${config.table}" in that base.`,
        502
      );
    }
    if (!res.ok) {
      throw new AirtableError(`Airtable returned ${res.status}.`);
    }

    const json = (await res.json()) as {
      records?: Array<{ id: string; fields?: Record<string, unknown> }>;
      offset?: string;
    };

    for (const record of json.records ?? []) {
      const fields = record.fields ?? {};
      if (config.phoneField in fields) sawPhoneKey = true;
      rows.push({
        id: record.id,
        roll: readRoll(fields[config.rollField]),
        name: String(fields[config.nameField] ?? "").trim(),
        phoneRaw: String(fields[config.phoneField] ?? "").trim(),
      });
    }

    offset = json.offset;
    pages += 1;
    // 5 requests/sec per base, shared across the whole integration.
    if (offset) await sleep(250);
  } while (offset && pages < 200);

  // The failure this guards against is quiet and destructive. A `fields[]`
  // name that does not match Airtable exactly is not an error: the column is
  // simply absent from every record, every number reads as blank, and the
  // preview then offers to clear the phone number of the entire chapter.
  if (rows.length > 0 && !sawPhoneKey) {
    throw new AirtableError(
      `Airtable returned no "${config.phoneField}" column. Check AIRTABLE_PHONE_FIELD against the column name in the base — it is case and space sensitive.`,
      502
    );
  }

  return rows;
}

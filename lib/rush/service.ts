// lib/rush/service.ts
// Reading and publishing the /rush page. The API routes call this; nothing
// else writes RushPage.
import { z } from "zod";
import { connectDB } from "@/lib/db";
import RushPage from "@/lib/models/RushPage";
import { badRequest, forbidden } from "@/lib/httpError";
import { RUSH_DEFAULTS } from "./defaults";
import { isValidInterestUrl } from "./format";
import { canEditRushPage } from "./permissions";
import type { RushPageData } from "./types";

export const MAX_REVISIONS = 20;

const text = (max: number) => z.string().max(max).transform((v) => v.trim());

export const rushPageSchema = z.object({
  isOpen: z.boolean(),
  eyebrow: text(120),
  title: text(120),
  intro: text(2000),
  closedIntro: text(2000),
  closedMessage: text(500),
  interestFormUrl: z
    .string()
    .trim()
    .refine(isValidInterestUrl, "The interest form link must start with https://"),
  interestFormLabel: text(60),
  eventsHeading: text(120),
  whyText: text(5000),
  startTitle: text(120),
  startText: text(3000),
  events: z
    .array(
      z.object({
        _id: z.string().optional(),
        title: text(120).refine((v) => v.length > 0, "Every event needs a title"),
        startsAt: z
          .string()
          .refine((v) => !Number.isNaN(new Date(v).getTime()), "Every event needs a date and time"),
        location: text(120),
        featuring: text(160).optional(),
        hidden: z.boolean().optional(),
      })
    )
    .max(40),
  poster: z.object({
    key: z
      .string()
      .regex(/^rush\/[a-z0-9_-]+\.jpg$/i)
      .nullable(),
    width: z.number().int().min(0).max(10000),
    height: z.number().int().min(0).max(10000),
    alt: text(200),
    hidden: z.boolean(),
  }),
});

/// The doc's fields over the defaults, so a field added later still renders.
function merge(doc: any): RushPageData {
  if (!doc) return structuredClone(RUSH_DEFAULTS);
  const out: any = { ...RUSH_DEFAULTS };
  for (const key of Object.keys(RUSH_DEFAULTS) as (keyof RushPageData)[]) {
    if (doc[key] !== undefined && doc[key] !== null) out[key] = doc[key];
  }
  out.events = (doc.events || []).map((e: any) => ({
    _id: e._id ? String(e._id) : undefined,
    title: e.title,
    startsAt: new Date(e.startsAt).toISOString(),
    location: e.location || "",
    featuring: e.featuring || "",
    hidden: Boolean(e.hidden),
  }));
  out.poster = {
    key: doc.poster?.key ?? null,
    width: doc.poster?.width ?? 0,
    height: doc.poster?.height ?? 0,
    alt: doc.poster?.alt || "Rush flyer",
    hidden: Boolean(doc.poster?.hidden),
  };
  return out as RushPageData;
}

export async function getRushPageData(): Promise<RushPageData> {
  await connectDB();
  const doc = await RushPage.findOne({ key: "public" }).lean<any>();
  return merge(doc);
}

export interface RushRevisionSummary {
  index: number;
  savedAt: string;
  savedByName: string;
}

export async function getRushEditorState() {
  await connectDB();
  const doc = await RushPage.findOne({ key: "public" }).lean<any>();
  return {
    data: merge(doc),
    isDefault: !doc,
    updatedAt: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    updatedByName: doc?.updatedByName || "",
    revisions: ((doc?.revisions || []) as any[]).map((r, index) => ({
      index,
      savedAt: new Date(r.savedAt).toISOString(),
      savedByName: r.savedByName || "",
    })) as RushRevisionSummary[],
  };
}

const nameOf = (actor: any) =>
  [actor?.fName, actor?.lName].filter(Boolean).join(" ") || "An officer";

async function assertEditor(actor: any) {
  if (!(await canEditRushPage(actor))) throw forbidden("Only the rush chair can edit this page");
}

/// Publishes `input`, keeping what was live before as a revision.
export async function saveRushPage(actor: any, input: unknown) {
  await assertEditor(actor);
  const parsed = rushPageSchema.safeParse(input);
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message || "Check the form and try again");
  }
  await connectDB();
  const previous = await RushPage.findOne({ key: "public" }).lean<any>();
  const snapshot = merge(previous);
  const revision = {
    savedAt: previous?.updatedAt ?? new Date(),
    savedByName: previous?.updatedByName || (previous ? "" : "Original page"),
    snapshot,
  };
  const data = parsed.data;
  data.events = [...data.events].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );
  const revisions = [revision, ...((previous?.revisions as any[]) || [])].slice(0, MAX_REVISIONS);

  await RushPage.updateOne(
    { key: "public" },
    {
      $set: {
        ...data,
        events: data.events.map(({ _id, ...e }) => ({
          ...(_id && /^[a-f0-9]{24}$/i.test(_id) ? { _id } : {}),
          ...e,
          startsAt: new Date(e.startsAt),
        })),
        updatedBy: actor?._id ?? null,
        updatedByName: nameOf(actor),
        revisions,
      },
    },
    { upsert: true }
  );
  return getRushEditorState();
}

export async function restoreRushRevision(actor: any, revisionIndex: number) {
  await assertEditor(actor);
  await connectDB();
  const doc = await RushPage.findOne({ key: "public" }).lean<any>();
  const revision = doc?.revisions?.[revisionIndex];
  if (!revision?.snapshot) throw badRequest("That version no longer exists");
  return saveRushPage(actor, revision.snapshot);
}

// GET  /api/newsletters  — the feed. Public.
// POST /api/newsletters  — start an issue. E-Council or admin.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Newsletter from "@/lib/models/Newsletter";
import logger from "@/lib/logger";
import { siteUrl } from "@/lib/siteUrl";
import {
  canEditNewsletters,
  optionalViewer,
  requireNewsletterEditor,
} from "@/lib/newsletterAuth";
import {
  LIMITS,
  NEWSLETTER_CATEGORIES,
  normalizeBlocks,
  serializeNewsletter,
  uniqueSlug,
} from "@/lib/newsletters";

export const runtime = "nodejs";
// The feed changes whenever an officer publishes, and a member who just
// refreshed should see it. Nothing here is expensive enough to cache.
export const dynamic = "force-dynamic";

/// Newest first, and "newest" means published, not edited.
///
/// Drafts have no `publishedAt` at all, so they sort by when they were last
/// touched instead — which is the order somebody working through a backlog of
/// half-written issues actually wants.
const FEED_SORT = { publishedAt: -1, createdAt: -1 } as const;

export async function GET(req: Request) {
  try {
    await connectDB();
    const url = new URL(req.url);

    const viewer = await optionalViewer();
    const isEditor = canEditNewsletters(viewer);
    // Drafts are opt-in even for an officer. The feed they see by default is
    // the feed the chapter sees, so "what did we publish" does not have to be
    // read around a half-written issue sitting at the top of it.
    const includeDrafts =
      isEditor && url.searchParams.get("includeDrafts") === "true";

    const filter: Record<string, unknown> = includeDrafts
      ? {}
      : { status: "published" };

    const category = url.searchParams.get("category");
    if (category && (NEWSLETTER_CATEGORIES as readonly string[]).includes(category)) {
      filter.category = category;
    }

    const limitRaw = Number(url.searchParams.get("limit"));
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 50;

    const docs = await Newsletter.find(filter)
      .sort(includeDrafts ? { updatedAt: -1 } : FEED_SORT)
      .limit(limit)
      .lean<any[]>();

    const origin = siteUrl();
    const feed = await Promise.all(
      docs.map((doc) => serializeNewsletter(doc, { origin }))
    );

    return NextResponse.json(feed, { status: 200 });
  } catch (err: any) {
    // A thrown exception is a server failure, not an authorisation decision.
    // Reads here are public, so there is no 403 this can legitimately be.
    logger.error({ err }, "Failed to list newsletters");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireNewsletterEditor();

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const title = String(payload.title ?? "").trim().slice(0, LIMITS.title);
    if (!title) {
      return NextResponse.json({ error: "A title is required" }, { status: 400 });
    }

    const blocks = normalizeBlocks(payload.blocks);
    const category = (NEWSLETTER_CATEGORIES as readonly string[]).includes(
      payload.category
    )
      ? payload.category
      : "chapter";

    const created = await Newsletter.create({
      title,
      slug: await uniqueSlug(title),
      // Stored blank when blank. `excerpt` derives a card line at read time;
      // writing one into the document made it a lede the author never wrote.
      summary: String(payload.summary ?? "").trim().slice(0, LIMITS.summary),
      category,
      coverImageKey: String(payload.coverImageKey ?? "").trim().slice(0, 512),
      coverAlt: String(payload.coverAlt ?? "").trim().slice(0, LIMITS.alt),
      blocks,
      // Always a draft. Publishing is a separate, deliberate act on the issue
      // itself, so no article can go live as a side effect of creating one.
      status: "draft",
      publishedAt: null,
      authorName:
        String(payload.authorName ?? "").trim().slice(0, 120) ||
        "Corresponding Secretary",
      createdBy: actor._id,
      updatedBy: actor._id,
    });

    const body = await serializeNewsletter(created.toObject(), {
      origin: siteUrl(),
      includeBlocks: true,
      includeStorageKeys: true,
    });
    return NextResponse.json(body, { status: 201 });
  } catch (err: any) {
    if (err?.statusCode) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error({ err }, "Failed to create newsletter");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET    /api/newsletters/<slug>  — read one issue, body included. Public.
// PATCH  /api/newsletters/<slug>  — edit, publish, unpublish. E-Council or admin.
// DELETE /api/newsletters/<slug>  — remove it and its artwork. E-Council or admin.
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
  fallbackSummary,
  normalizeBlocks,
  serializeNewsletter,
  imageKeysIn,
  uniqueSlug,
  type NewsletterBlock,
} from "@/lib/newsletters";
import { deleteNewsletterImage } from "@/lib/newsletterStorage";
import { announceNewsletter } from "@/lib/newsletterNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: { slug: string } };

/// Every object this document owns, so nothing is orphaned in the bucket when
/// a block is deleted or the whole issue is.
function imageKeysOf(doc: any): string[] {
  const blocks: NewsletterBlock[] = Array.isArray(doc?.blocks) ? doc.blocks : [];
  const keys = imageKeysIn(blocks);
  if (doc?.coverImageKey) keys.push(doc.coverImageKey);
  return Array.from(new Set(keys));
}

export async function GET(req: Request, { params }: Params) {
  try {
    await connectDB();
    const editorView = new URL(req.url).searchParams.get("edit") === "true";
    if (editorView) await requireNewsletterEditor();

    const doc = await Newsletter.findOne({ slug: params.slug }).lean<any>();
    if (!doc) {
      return NextResponse.json({ error: "Newsletter not found" }, { status: 404 });
    }

    if (doc.status !== "published" && !editorView) {
      // A draft answers 404 rather than 403 to anyone who cannot edit it.
      // Forbidden would confirm that an article by that name exists, which is
      // exactly what a guessable slug should not leak before it is published.
      const viewer = await optionalViewer();
      if (!canEditNewsletters(viewer)) {
        return NextResponse.json(
          { error: "Newsletter not found" },
          { status: 404 }
        );
      }
    }

    const body = await serializeNewsletter(doc, {
      origin: siteUrl(),
      includeBlocks: true,
      includeStorageKeys: editorView,
    });
    return NextResponse.json(body, { status: 200 });
  } catch (err: any) {
    if (err?.statusCode) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error({ err, slug: params.slug }, "Failed to read newsletter");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await requireNewsletterEditor();

    const doc = await Newsletter.findOne({ slug: params.slug });
    if (!doc) {
      return NextResponse.json({ error: "Newsletter not found" }, { status: 404 });
    }

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const keysBefore = imageKeysOf(doc.toObject());

    if (typeof payload.title === "string") {
      const title = payload.title.trim().slice(0, LIMITS.title);
      if (!title) {
        return NextResponse.json(
          { error: "A title is required" },
          { status: 400 }
        );
      }
      // The slug follows the title only while the issue is a draft.
      //
      // Once it is published the slug is somebody's link: it has been texted,
      // posted, and shared out of the app. Renaming the article three weeks
      // later must not turn every one of those into a 404, so a published
      // issue keeps the address it was published at however its headline is
      // reworded.
      if (doc.status === "draft" && title !== doc.title) {
        doc.slug = await uniqueSlug(title, String(doc._id));
      }
      doc.title = title;
    }

    if (typeof payload.summary === "string") {
      doc.summary = payload.summary.trim().slice(0, LIMITS.summary);
    }

    if (
      typeof payload.category === "string" &&
      (NEWSLETTER_CATEGORIES as readonly string[]).includes(payload.category)
    ) {
      doc.category = payload.category;
    }

    if (Array.isArray(payload.blocks)) {
      doc.blocks = normalizeBlocks(payload.blocks);
    }

    if (typeof payload.coverImageKey === "string") {
      doc.coverImageKey = payload.coverImageKey.trim().slice(0, 512);
    }
    if (typeof payload.coverAlt === "string") {
      doc.coverAlt = payload.coverAlt.trim().slice(0, LIMITS.alt);
    }
    if (typeof payload.authorName === "string" && payload.authorName.trim()) {
      doc.authorName = payload.authorName.trim().slice(0, 120);
    }

    // Whether this save is the moment it goes live. Worked out before the save
    // so the announcement can be gated on a fact rather than on a re-read.
    let isFirstPublish = false;

    if (payload.status === "published" || payload.status === "draft") {
      const goingLive = payload.status === "published" && doc.status !== "published";
      if (goingLive) {
        if (!(doc.blocks ?? []).length) {
          return NextResponse.json(
            { error: "Add something to the article before publishing it." },
            { status: 400 }
          );
        }
        // Stamped once. An issue pulled back to draft and published again
        // keeps its original date, so correcting a mistake does not move a
        // three-week-old article to the top of everybody's feed.
        if (!doc.publishedAt) doc.publishedAt = new Date();
        isFirstPublish = !doc.notifiedAt;
        // Claimed here, before the send and in the same save as the status.
        // Two officers hitting publish at once, or one retried request, would
        // otherwise both read "not yet notified" and push the chapter twice.
        if (isFirstPublish) doc.notifiedAt = new Date();
      }
      doc.status = payload.status;
    }

    doc.updatedBy = actor._id;
    await doc.save();

    const saved = doc.toObject();

    // Artwork dropped from the article during this edit. Best-effort and
    // deliberately after the save: losing a picture that is still referenced
    // is unrecoverable, whereas an object nobody points at costs kilobytes.
    const keysAfter = new Set(imageKeysOf(saved));
    await Promise.all(
      keysBefore
        .filter((key) => !keysAfter.has(key))
        .map((key) => deleteNewsletterImage(key))
    );

    const body = await serializeNewsletter(saved, {
      origin: siteUrl(),
      includeBlocks: true,
      includeStorageKeys: true,
    });

    if (isFirstPublish) {
      // Not awaited. The officer's screen should not sit on sixty pushes and
      // sixty emails, and `announceNewsletter` swallows its own failures.
      void announceNewsletter({
        title: saved.title,
        slug: saved.slug,
        // The derived line, not the authored one: an issue published with
        // no summary would otherwise send an email with a blank paragraph.
        summary: body.excerpt,
        authorName: saved.authorName,
        actorId: actor._id,
      });
    }

    return NextResponse.json(body, { status: 200 });
  } catch (err: any) {
    if (err?.statusCode) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error({ err, slug: params.slug }, "Failed to update newsletter");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    await requireNewsletterEditor();

    const doc = await Newsletter.findOne({ slug: params.slug }).lean<any>();
    if (!doc) {
      return NextResponse.json({ error: "Newsletter not found" }, { status: 404 });
    }

    await Newsletter.deleteOne({ _id: doc._id });
    // After the row is gone. If cleanup fails the article is still deleted,
    // which is what was asked for.
    await Promise.all(imageKeysOf(doc).map((key) => deleteNewsletterImage(key)));

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    if (err?.statusCode) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error({ err, slug: params.slug }, "Failed to delete newsletter");
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

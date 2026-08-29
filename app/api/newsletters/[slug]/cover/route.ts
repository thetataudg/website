// GET /api/newsletters/<slug>/cover — a stable address for one issue's artwork.
//
// This exists for link previews. Garage URLs are presigned and expire within
// the hour, but an og:image is fetched whenever somebody's phone decides to
// unfurl the link, which may be days after the message was sent. Pointing
// og:image at a signed URL means every shared newsletter eventually previews
// as a broken image.
//
// So the metadata points here instead, and this redirects to a signature
// minted at the moment of the request.
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Newsletter from "@/lib/models/Newsletter";
import logger from "@/lib/logger";
import { signNewsletterImage } from "@/lib/newsletterStorage";
import { absoluteUrl } from "@/lib/siteUrl";
import { imageKeysIn } from "@/lib/newsletterTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/// Shown when an issue has no artwork at all, so an unfurled link still gets a
/// picture rather than the bare grey card most clients draw instead.
const FALLBACK = "/og-default.jpg";

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    await connectDB();
    // Published only. A draft's artwork is as unpublished as its text.
    const doc = await Newsletter.findOne({
      slug: params.slug,
      status: "published",
    })
      .select("coverImageKey blocks")
      .lean<any>();

    const key =
      doc?.coverImageKey ||
      (Array.isArray(doc?.blocks)
        ? imageKeysIn(doc.blocks)[0]
        : "") ||
      "";

    const signed = key ? await signNewsletterImage(key) : "";
    // 307 rather than 301: the target carries a signature that is only good
    // for the next hour, and a permanent redirect would be cached against a
    // URL that has since expired.
    return NextResponse.redirect(signed || absoluteUrl(FALLBACK), 307);
  } catch (err: any) {
    logger.error({ err, slug: params.slug }, "Failed to resolve newsletter cover");
    return NextResponse.redirect(absoluteUrl(FALLBACK), 307);
  }
}

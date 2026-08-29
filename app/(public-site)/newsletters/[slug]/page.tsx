import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import Newsletter from "@/lib/models/Newsletter";
import logger from "@/lib/logger";
import { absoluteUrl, siteUrl } from "@/lib/siteUrl";
import { pageMetadata } from "@/lib/seo";
import {
  newsletterPath,
  serializeNewsletter,
  type SerializedNewsletter,
} from "@/lib/newsletters";
import ArticleBlocks from "../ArticleBlocks";
import ShareButton from "../ShareButton";
import { CATEGORY_LABELS } from "../categories";

export const dynamic = "force-dynamic";

/// The sheet's width at each breakpoint.
///
/// One constant because the hero, the paper and the footer all have to sit on
/// the same axis, and three copies of a max-width drift the moment one of them
/// is tuned.
const SHEET = "mx-auto w-full max-w-[46rem] lg:max-w-[54rem] xl:max-w-[62rem]";

/// Back to the archive.
///
/// A drawn arrow rather than a "←" character. The literal arrow inherited the
/// display face, came out at a different weight and baseline from the words
/// next to it, and could not be given a hit area of its own.
function BackLink() {
  return (
    <Link
      href="/newsletters"
      className="group inline-flex items-center gap-2.5 text-white/70 transition hover:text-white"
    >
      <span className="inline-flex size-9 items-center justify-center rounded-full border border-white/25 bg-black/25 backdrop-blur-sm transition group-hover:border-white/50 group-hover:bg-black/40">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4"
        >
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
        All newsletters
      </span>
    </Link>
  );
}

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "America/Phoenix",
      }).format(new Date(value))
    : "";

/// Published issues only.
///
/// A draft is not reachable here even by an officer who could edit it. The
/// preview lives in the builder, on the members-only side; this route is the
/// public address, and giving it a second, signed-in behaviour would make
/// "what does the shared link look like" impossible to answer honestly.
async function loadNewsletter(slug: string): Promise<SerializedNewsletter | null> {
  try {
    await connectDB();
    const doc = await Newsletter.findOne({ slug, status: "published" }).lean<any>();
    if (!doc) return null;
    return await serializeNewsletter(doc, {
      origin: siteUrl(),
      includeBlocks: true,
    });
  } catch (err: any) {
    logger.error({ err, slug }, "Failed to load newsletter");
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const letter = await loadNewsletter(params.slug);
  if (!letter) {
    return pageMetadata({
      title: "Newsletter",
      description: "This newsletter is not available.",
      path: newsletterPath(params.slug),
      noindex: true,
    });
  }

  const base = pageMetadata({
    title: letter.title,
    description: letter.excerpt,
    path: newsletterPath(letter.slug),
    image: {
      // Not the signed URL from `coverImageUrl`. That expires within the hour,
      // and an unfurler may reach for this days after the link was sent.
      url: absoluteUrl(`/api/newsletters/${letter.slug}/cover`),
      width: 1200,
      height: 630,
      alt: letter.coverAlt || letter.title,
    },
  });

  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: letter.publishedAt ?? undefined,
      authors: [letter.authorName],
    },
  };
}

/**
 * One issue, read.
 *
 * A magazine open: the cover photo runs full bleed with the headline set over
 * it, and the article itself is a paper column that starts just underneath and
 * overlaps it. The previous version put the photo in the middle of a card
 * between the byline and the first heading, where it read as an attachment
 * rather than as the thing the story is about.
 *
 * Everything stays in one 46rem measure so the headline, the lede and the body
 * share an edge.
 */
export default async function NewsletterArticlePage({
  params,
}: {
  params: { slug: string };
}) {
  const letter = await loadNewsletter(params.slug);
  if (!letter) notFound();

  const dateline = [
    CATEGORY_LABELS[letter.category],
    formatDate(letter.publishedAt),
    `${letter.readingMinutes} min read`,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const hasCover = Boolean(letter.coverImageUrl);

  return (
    <main className="bg-[#120a0a] pb-24 text-white">
      <header
        className={`relative isolate flex items-end ${
          hasCover
            ? "min-h-[26rem] sm:min-h-[32rem]"
            : "min-h-[18rem] pt-28 sm:min-h-[20rem]"
        }`}
      >
        {hasCover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={letter.coverImageUrl}
              alt={letter.coverAlt}
              className="absolute inset-0 -z-10 h-full w-full object-cover"
            />
            {/* Two stops rather than one. A single fade left the headline
                sitting on whatever the photo happened to be doing there, and
                the next issue's cover will be pale where this one is dark. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-gradient-to-t from-[#120a0a] via-[#120a0a]/75 to-[#120a0a]/25"
            />
          </>
        ) : null}

        <div className={`${SHEET} px-6 pb-12 pt-24 sm:px-10 lg:px-14`}>
          <BackLink />

          <div className="max-w-[42rem]">
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f5d79a]">
              {dateline}
            </p>
            <h1 className="mt-3 text-[2rem] font-bold leading-[1.1] tracking-tight text-white drop-shadow-sm sm:text-[2.75rem] lg:text-[3.25rem]">
              {letter.title}
            </h1>
          </div>
        </div>
      </header>

      {/* Pulled up over the hero so the paper reads as lying on the photo.
          `relative` is load-bearing here: without it the negative margin puts
          the sheet underneath the image instead of on top of it. */}
      <article className={`relative -mt-6 px-4 sm:px-6 ${SHEET}`}>
        <div className="overflow-hidden rounded-2xl bg-[#fbf6dc] px-6 pb-14 pt-10 text-[#1b0f0f] sm:px-10 sm:pt-12 lg:px-14">
          {/* Only when somebody actually wrote one. Deriving it from the first
              paragraph printed the opening line twice, once as a lede and
              again as itself. */}
          {letter.summary ? (
            <p className="mx-auto mb-9 w-full max-w-[38rem] border-l-[3px] border-[#7a0104] pl-5 text-lg leading-relaxed text-[#1b0f0f]/75">
              {letter.summary}
            </p>
          ) : null}

          <ArticleBlocks blocks={letter.blocks ?? []} />

          <footer className="mx-auto mt-14 flex w-full max-w-[38rem] flex-wrap items-center justify-between gap-3 border-t border-[#1b0f0f]/10 pt-6">
            <div>
              <p className="text-sm font-semibold text-[#1b0f0f]/75">
                {letter.authorName}
              </p>
              <p className="text-sm text-[#1b0f0f]/50">
                Published {formatDate(letter.publishedAt)}
              </p>
            </div>
            <ShareButton url={letter.shareUrl} className="text-[#7a0104]" />
          </footer>
        </div>
      </article>
    </main>
  );
}

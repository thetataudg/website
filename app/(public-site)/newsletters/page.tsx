import Link from "next/link";
import { bungee } from "../../fonts";
import { connectDB } from "@/lib/db";
import Newsletter from "@/lib/models/Newsletter";
import logger from "@/lib/logger";
import { siteUrl } from "@/lib/siteUrl";
import {
  NEWSLETTER_CATEGORIES,
  plainText,
  serializeNewsletter,
  type SerializedNewsletter,
} from "@/lib/newsletters";
import { CATEGORY_LABELS } from "./categories";
import NewsletterFilters from "./NewsletterFilters";

// Published from the members-only builder rather than at build time, so this
// has to be read per request. A newsletter that went out this morning showing
// up tomorrow would be worse than no feed at all.
export const dynamic = "force-dynamic";

const PER_PAGE = 9;

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "America/Phoenix",
      }).format(new Date(value))
    : "";

interface Search {
  q?: string;
  category?: string;
  page?: string;
}

/// Every published issue, filtered.
///
/// The search runs over the body as well as the title, so looking for "Bike
/// Saviors" finds the issue that mentions it rather than only one with it in
/// the headline. That is done in memory rather than with a Mongo text index on
/// purpose: the archive is a dozen documents a year, the blocks are already in
/// the result set, and a text index would need maintaining for a collection
/// that will not outgrow this for a decade.
async function loadNewsletters(search: Search): Promise<{
  results: SerializedNewsletter[];
  total: number;
}> {
  try {
    await connectDB();

    const filter: Record<string, unknown> = { status: "published" };
    if (
      search.category &&
      (NEWSLETTER_CATEGORIES as readonly string[]).includes(search.category)
    ) {
      filter.category = search.category;
    }

    const docs = await Newsletter.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(300)
      .lean<any[]>();

    const needle = (search.q ?? "").trim().toLowerCase();
    const matched = needle
      ? docs.filter((doc) =>
          [doc.title, doc.summary, doc.authorName, plainText(doc.blocks ?? [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(needle)
        )
      : docs;

    const page = Math.max(1, Number(search.page) || 1);
    const slice = matched.slice((page - 1) * PER_PAGE, page * PER_PAGE);

    const origin = siteUrl();
    return {
      results: await Promise.all(
        slice.map((doc) => serializeNewsletter(doc, { origin }))
      ),
      total: matched.length,
    };
  } catch (err: any) {
    // A database that is down should cost the visitor the list, not the page.
    logger.error({ err }, "Public newsletter feed failed to load");
    return { results: [], total: 0 };
  }
}

export default async function NewslettersPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const query = (searchParams.q ?? "").trim();
  const category = searchParams.category ?? "";
  const page = Math.max(1, Number(searchParams.page) || 1);

  const { results, total } = await loadNewsletters(searchParams);
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  // The wide lead card is only the newest issue of the whole archive. On a
  // filtered or paged view it would be "the newest thing matching this", which
  // is not a lead, just an arbitrarily larger card.
  const isArchiveHome = page === 1 && !query && !category;
  const [lead, ...rest] = isArchiveHome ? results : [];
  const grid = isArchiveHome ? rest : results;

  return (
    <main className="bg-[#120a0a] px-4 pb-24 pt-24 text-white sm:px-6 sm:pt-28">
      <div className="mx-auto w-full max-w-5xl">
        <section className="pb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#f5d79a]">
            Delta Gamma
          </p>
          <h1 className={`${bungee.className} mt-2 text-2xl text-[#b3202a] sm:text-4xl`}>
            Newsletters
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/70">
            What the chapter has been doing, written up by the Corresponding
            Secretary. Rush, service, professional development, and the numbers
            behind all three.
          </p>
        </section>

        <NewsletterFilters query={query} category={category} total={total} />

        {results.length === 0 ? (
          <section className="rounded-2xl bg-[#fbf6dc] px-8 py-14 text-center text-[#1b0f0f]">
            <h2 className="text-xl font-bold text-[#7a0104]">
              {query || category ? "Nothing matches that" : "Nothing published yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-base text-[#1b0f0f]/70">
              {query || category
                ? "Try a different word, or clear the filters."
                : "The first issue is on its way. Check back soon."}
            </p>
            {query || category ? (
              <Link
                href="/newsletters"
                className="mt-5 inline-block rounded-full bg-[#7a0104] px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              >
                Clear filters
              </Link>
            ) : null}
          </section>
        ) : (
          <>
            {lead ? (
              <section>
                <Link
                  href={`/newsletters/${lead.slug}`}
                  className="group block overflow-hidden rounded-2xl bg-[#fbf6dc] text-[#1b0f0f] transition hover:opacity-95"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-[1.1fr,0.9fr]">
                    {lead.coverImageUrl ? (
                      <div className="relative h-52 overflow-hidden lg:h-full lg:min-h-[16rem]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={lead.coverImageUrl}
                          alt={lead.coverAlt}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-col justify-center p-6 sm:p-8">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a0104]">
                        {CATEGORY_LABELS[lead.category]} · {formatDate(lead.publishedAt)}
                      </p>
                      <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-[1.75rem]">
                        {lead.title}
                      </h2>
                      <p className="mt-3 text-base leading-relaxed text-[#1b0f0f]/70">
                        {lead.excerpt}
                      </p>
                      <p className="mt-5 text-sm text-[#1b0f0f]/55">
                        {lead.authorName} · {lead.readingMinutes} min read
                      </p>
                    </div>
                  </div>
                </Link>
              </section>
            ) : null}

            {grid.length > 0 ? (
              <section
                className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 ${
                  lead ? "mt-5" : ""
                }`}
              >
                {grid.map((letter) => (
                  <Link
                    key={letter.id}
                    href={`/newsletters/${letter.slug}`}
                    className="group flex flex-col overflow-hidden rounded-2xl bg-[#fbf6dc] text-[#1b0f0f] transition hover:opacity-95"
                  >
                    {letter.coverImageUrl ? (
                      <div className="h-36 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={letter.coverImageUrl}
                          alt={letter.coverAlt}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-1 flex-col p-5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a0104]">
                        {CATEGORY_LABELS[letter.category]}
                      </p>
                      <h3 className="mt-1.5 text-lg font-bold leading-snug tracking-tight">
                        {letter.title}
                      </h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#1b0f0f]/70">
                        {letter.excerpt}
                      </p>
                      <p className="mt-auto pt-4 text-xs text-[#1b0f0f]/50">
                        {formatDate(letter.publishedAt)} · {letter.readingMinutes} min
                        read
                      </p>
                    </div>
                  </Link>
                ))}
              </section>
            ) : null}

            <Pagination page={page} pageCount={pageCount} query={query} category={category} />
          </>
        )}
      </div>
    </main>
  );
}

/// Plain links, not buttons.
///
/// Every page of the archive is a real URL, so each one can be shared, indexed
/// and reached with the back button. A click handler swapping React state would
/// have made page four unlinkable.
function Pagination({
  page,
  pageCount,
  query,
  category,
}: {
  page: number;
  pageCount: number;
  query: string;
  category: string;
}) {
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (category) search.set("category", category);
    if (target > 1) search.set("page", String(target));
    const suffix = search.toString();
    return suffix ? `/newsletters?${suffix}` : "/newsletters";
  };

  const pages = Array.from({ length: pageCount }, (_, index) => index + 1).filter(
    (candidate) =>
      candidate === 1 ||
      candidate === pageCount ||
      Math.abs(candidate - page) <= 1
  );

  return (
    <nav
      aria-label="Newsletter pages"
      className="mt-10 flex flex-wrap items-center justify-center gap-2"
    >
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          className="rounded-full bg-white/[0.06] px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.12] hover:text-white"
        >
          Previous
        </Link>
      ) : null}

      {pages.map((candidate, index) => (
        <span key={candidate} className="flex items-center gap-2">
          {index > 0 && candidate - pages[index - 1] > 1 ? (
            <span className="text-white/30">…</span>
          ) : null}
          <Link
            href={href(candidate)}
            aria-current={candidate === page ? "page" : undefined}
            className={`min-w-9 rounded-full px-3 py-2 text-center text-sm transition ${
              candidate === page
                ? "bg-[#f5d79a] font-semibold text-[#1b0f0f]"
                : "bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white"
            }`}
          >
            {candidate}
          </Link>
        </span>
      ))}

      {page < pageCount ? (
        <Link
          href={href(page + 1)}
          className="rounded-full bg-white/[0.06] px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.12] hover:text-white"
        >
          Next
        </Link>
      ) : null}
    </nav>
  );
}

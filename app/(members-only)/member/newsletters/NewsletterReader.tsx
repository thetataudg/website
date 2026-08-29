"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ArticleBlocks from "@/app/(public-site)/newsletters/ArticleBlocks";
import CopyLinkButton from "./CopyLinkButton";
import type { SerializedNewsletter } from "@/lib/newsletterTypes";

const CATEGORY_LABELS: Record<string, string> = {
  chapter: "Chapter",
  brotherhood: "Brotherhood",
  professional: "Professional",
  service: "Service",
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "America/Phoenix",
      }).format(new Date(value))
    : "";

/**
 * Reading an issue without leaving the members area.
 *
 * Members who cannot edit used to land on "Not yours to edit" here, which is
 * true and useless: they came to read it. They get the article, in the same
 * measure and the same block renderer the public page uses, on the members
 * area's own light/dark surface.
 */
export default function NewsletterReader({
  letter,
}: {
  letter: SerializedNewsletter;
}) {
  const dateline = [
    CATEGORY_LABELS[letter.category] ?? letter.category,
    formatDate(letter.publishedAt),
    `${letter.readingMinutes} min read`,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <div className="mx-auto w-full max-w-[46rem] px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/member/newsletters"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Newsletters
        </Link>
        <div className="flex items-center gap-2">
          <CopyLinkButton url={letter.shareUrl} disabled={letter.status !== "published"} />
          {letter.status === "published" ? (
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/newsletters/${letter.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 size-3.5" aria-hidden="true" />
                Public page
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <article className="mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          {dateline}
        </p>
        <h1 className="mt-2 text-[1.75rem] font-bold leading-[1.15] tracking-tight text-foreground sm:text-[2.25rem]">
          {letter.title}
        </h1>
        {letter.status !== "published" ? (
          <Badge variant="secondary" className="mt-3">
            Draft, not public yet
          </Badge>
        ) : null}

        {/* Only when somebody actually wrote one, matching the public page. */}
        {letter.summary ? (
          <p className="mt-5 border-l-[3px] border-primary pl-4 text-lg leading-relaxed text-muted-foreground">
            {letter.summary}
          </p>
        ) : null}

        {letter.coverImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={letter.coverImageUrl}
            alt={letter.coverAlt}
            className="mt-6 aspect-[16/9] w-full rounded-xl bg-muted object-cover"
          />
        ) : null}

        <div className="mt-8">
          <ArticleBlocks blocks={letter.blocks ?? []} tone="app" />
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <div>
            <p className="text-sm font-medium text-foreground">{letter.authorName}</p>
            <p className="text-sm text-muted-foreground">
              {letter.publishedAt
                ? `Published ${formatDate(letter.publishedAt)}`
                : "Not published yet"}
            </p>
          </div>
          <CopyLinkButton url={letter.shareUrl} disabled={letter.status !== "published"} />
        </footer>
      </article>
    </div>
  );
}

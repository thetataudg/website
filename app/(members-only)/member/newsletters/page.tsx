"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  FileText,
  Loader2,
  Newspaper,
  Pencil,
  Search,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { EmptyState, LoadingState } from "../../components/shell/States";
import { PageContainer, PageHeader } from "../../components/shell/PageShell";
import type { SerializedNewsletter } from "@/lib/newsletterTypes";
import CopyLinkButton from "./CopyLinkButton";
import { canEdit, useNewsletterPermissions } from "./useNewsletterPermissions";
import { NEWSLETTER_CATEGORIES } from "@/lib/newsletterTypes";

const CATEGORY_LABELS: Record<string, string> = {
  chapter: "Chapter",
  brotherhood: "Brotherhood",
  professional: "Professional",
  service: "Service",
};

const PER_PAGE = 9;

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: "America/Phoenix",
      }).format(new Date(value))
    : "";

export default function MemberNewslettersPage() {
  const router = useRouter();
  const viewer = useNewsletterPermissions();
  const isEditor = canEdit(viewer);

  const [newsletters, setNewsletters] = useState<SerializedNewsletter[] | null>(
    null
  );
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SerializedNewsletter | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [status, setStatus] = useState<"all" | "draft" | "published">("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        isEditor ? "/api/newsletters?includeDrafts=true" : "/api/newsletters"
      );
      if (!res.ok) throw new Error("Could not load newsletters");
      setNewsletters(await res.json());
    } catch (err: any) {
      setNewsletters([]);
      toast.error(err.message || "Could not load newsletters");
    }
  }, [isEditor]);

  useEffect(() => {
    // Waits for the profile, because the request itself differs: an editor
    // asks for the drafts too. Firing before `viewer.loaded` would fetch the
    // public feed and then immediately fetch it again.
    if (!viewer.loaded) return;
    load();
  }, [viewer.loaded, load]);

  /// Search runs over the title, the summary and the byline. Not the body:
  /// the feed response deliberately omits it, and asking for twenty article
  /// bodies to power a search box on a page listing twelve of them is the
  /// wrong trade.
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (newsletters ?? []).filter((letter) => {
      if (status !== "all" && letter.status !== status) return false;
      if (category && letter.category !== category) return false;
      if (!needle) return true;
      return [letter.title, letter.excerpt, letter.authorName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [newsletters, search, status, category]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  // Clamped rather than reset. Deleting the last item on page three should
  // land on page two, not send the officer back to the beginning.
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PER_PAGE,
    currentPage * PER_PAGE
  );

  const isFiltering = Boolean(search.trim() || category || status !== "all");

  useEffect(() => {
    setPage(1);
  }, [search, category, status]);

  async function createDraft() {
    setCreating(true);
    try {
      const res = await fetch("/api/newsletters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled newsletter" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start a newsletter");
      // Straight into the builder. The list is not where anybody wants to be
      // after asking for a new article.
      router.push(`/member/newsletters/${data.slug}`);
    } catch (err: any) {
      toast.error(err.message || "Could not start a newsletter");
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/newsletters/${pendingDelete.slug}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete that newsletter");
      }
      toast.success(`Deleted "${pendingDelete.title}"`);
      setPendingDelete(null);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Could not delete that newsletter");
    } finally {
      setDeleting(false);
    }
  }

  if (!viewer.loaded || newsletters === null) {
    return (
      <PageContainer>
        <PageHeader title="Newsletters" />
        <LoadingState />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Newsletters"
        description={
          isEditor
            ? "Write, publish, and share the chapter's newsletters."
            : "Everything the chapter has published."
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/newsletters" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 size-4" aria-hidden="true" />
                Public page
              </Link>
            </Button>
            {isEditor ? (
              <Button onClick={createDraft} disabled={creating}>
                {creating ? (
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="mr-2 size-4" aria-hidden="true" />
                )}
                New newsletter
              </Button>
            ) : null}
          </>
        }
      />

      {newsletters.length > 0 ? (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search newsletters"
              aria-label="Search newsletters"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Only offered to somebody who can see drafts in the first place.
                A member with no drafts in their feed would get a filter that
                always returns nothing. */}
            {isEditor
              ? (["all", "published", "draft"] as const).map((option) => (
                  <Chip
                    key={option}
                    label={
                      option === "all"
                        ? "All"
                        : option[0].toUpperCase() + option.slice(1)
                    }
                    active={status === option}
                    onClick={() => setStatus(option)}
                  />
                ))
              : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            {NEWSLETTER_CATEGORIES.map((option) => (
              <Chip
                key={option}
                label={CATEGORY_LABELS[option]}
                active={category === option}
                onClick={() => setCategory(category === option ? "" : option)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Newspaper aria-hidden="true" />}
          title={
            isFiltering ? "Nothing matches that" : "No newsletters yet"
          }
          description={
            isFiltering
              ? "Try a different word, or clear the filters."
              : isEditor
                ? "Start one and it stays a draft until you publish it."
                : "The Corresponding Secretary hasn't published one yet."
          }
          action={
            isFiltering ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setCategory("");
                  setStatus("all");
                }}
              >
                Clear filters
              </Button>
            ) : isEditor ? (
              <Button onClick={createDraft} disabled={creating}>
                <Plus className="mr-2 size-4" aria-hidden="true" />
                New newsletter
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((letter) => (
              <NewsletterCard
                key={letter.id}
                letter={letter}
                isEditor={isEditor}
                onDelete={() => setPendingDelete(letter)}
              />
            ))}
          </div>

          {pageCount > 1 ? (
            <Pagination className="mt-6">
              <PaginationContent>
                {currentPage > 1 ? (
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setPage(currentPage - 1);
                      }}
                    />
                  </PaginationItem>
                ) : null}
                {Array.from({ length: pageCount }, (_, index) => index + 1).map(
                  (candidate) => (
                    <PaginationItem key={candidate}>
                      <PaginationLink
                        href="#"
                        isActive={candidate === currentPage}
                        onClick={(event) => {
                          event.preventDefault();
                          setPage(candidate);
                        }}
                      >
                        {candidate}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
                {currentPage < pageCount ? (
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setPage(currentPage + 1);
                      }}
                    />
                  </PaginationItem>
                ) : null}
              </PaginationContent>
            </Pagination>
          ) : null}
        </>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{pendingDelete?.title}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.status === "published"
                ? "This issue is public. Deleting it removes the article, its pictures, and breaks any link that has already been shared. This cannot be undone."
                : "This draft and its pictures will be removed. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Radix closes on click by default, which would tear the dialog
                // down mid-request and lose the spinner.
                event.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function NewsletterCard({
  letter,
  isEditor,
  onDelete,
}: {
  letter: SerializedNewsletter;
  isEditor: boolean;
  onDelete: () => void;
}) {
  const isDraft = letter.status === "draft";
  // Always the members-only route, for editors and readers alike. That page
  // is the builder for somebody who can edit and the article for somebody who
  // cannot, so one destination serves both without the card having to know
  // which kind of person clicked it.
  const href = `/member/newsletters/${letter.slug}`;

  return (
    <Card className="flex flex-col overflow-hidden">
      <Link href={href} className="block">
        {letter.coverImageUrl ? (
          <div className="h-32 overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={letter.coverImageUrl}
              alt={letter.coverAlt}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center bg-muted text-muted-foreground">
            <FileText className="size-8" aria-hidden="true" />
          </div>
        )}
      </Link>
      <CardContent className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isDraft ? "secondary" : "default"}>
            {isDraft ? "Draft" : "Published"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {CATEGORY_LABELS[letter.category] ?? letter.category}
          </span>
        </div>
        <Link href={href} className="block">
          <h3 className="line-clamp-2 text-base font-semibold text-foreground hover:underline">
            {letter.title}
          </h3>
        </Link>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {letter.excerpt || "No excerpt yet."}
        </p>
        <p className="text-xs text-muted-foreground">
          {isDraft
            ? `Edited ${formatDate(letter.updatedAt)}`
            : `${formatDate(letter.publishedAt)} · ${letter.readingMinutes} min read`}
        </p>

        {isEditor ? (
          <div className="mt-auto flex flex-wrap gap-2 pt-3">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/member/newsletters/${letter.slug}`}>
                <Pencil className="mr-1.5 size-3.5" aria-hidden="true" />
                Edit
              </Link>
            </Button>
            <CopyLinkButton
              url={letter.shareUrl}
              disabled={letter.status !== "published"}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Delete ${letter.title}`}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/// One filter toggle.
///
/// A row of these rather than a `Select`: there are four categories and three
/// statuses, all of them one word, and a dropdown for that is a click and a
/// menu to do what a tap should.
function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

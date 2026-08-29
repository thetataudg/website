"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ErrorState, LoadingState } from "../../../components/shell/States";
import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import BlockEditor, {
  uploadNewsletterImage,
  type DraftBlock,
} from "../components/BlockEditor";
import CopyLinkButton from "../CopyLinkButton";
import { canEdit, useNewsletterPermissions } from "../useNewsletterPermissions";
import NewsletterReader from "../NewsletterReader";
import { NEWSLETTER_CATEGORIES, type SerializedNewsletter } from "@/lib/newsletterTypes";

const CATEGORY_LABELS: Record<string, string> = {
  chapter: "Chapter",
  brotherhood: "Brotherhood",
  professional: "Professional",
  service: "Service",
};

interface Draft {
  title: string;
  summary: string;
  category: string;
  authorName: string;
  coverImageKey: string;
  coverImageUrl: string;
  coverAlt: string;
  blocks: DraftBlock[];
}

const draftFrom = (letter: SerializedNewsletter): Draft => ({
  title: letter.title,
  summary: letter.summary,
  category: letter.category,
  authorName: letter.authorName,
  // The editor endpoint includes storage keys after authorising the viewer.
  // Public article responses still expose signed URLs only.
  coverImageKey: letter.coverImageKey ?? "",
  coverImageUrl: letter.coverImageUrl,
  coverAlt: letter.coverAlt,
  blocks: (letter.blocks ?? []).map((block) => ({ ...block })),
});

export default function NewsletterBuilderPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const viewer = useNewsletterPermissions();
  const isEditor = canEdit(viewer);

  const [letter, setLetter] = useState<SerializedNewsletter | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const coverInput = useRef<HTMLInputElement>(null);

  // The slug moves when a draft's title changes, and the URL has to follow or
  // the next save would address an article that no longer answers to it.
  const slugRef = useRef(params.slug);

  const load = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/newsletters/${slug}?edit=true`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load that newsletter");
      setLetter(data);
      setDraft(draftFrom(data));
      setDirty(false);
      slugRef.current = data.slug;
    } catch (err: any) {
      setLoadError(err.message || "Could not load that newsletter");
    }
  }, []);

  useEffect(() => {
    if (!viewer.loaded) return;
    load(params.slug);
  }, [viewer.loaded, params.slug, load]);

  const patch = useCallback((changes: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...changes } : current));
    setDirty(true);
  }, []);

  /// One save path for both "save" and "publish".
  ///
  /// Publishing sends the body in the same request rather than saving and then
  /// flipping a flag, because two requests meant an issue could go live
  /// carrying the version before the officer's last edit if the second one
  /// raced the first.
  const save = useCallback(
    async (status?: "draft" | "published"): Promise<SerializedNewsletter | null> => {
      if (!draft) return null;
      const body: Record<string, unknown> = {
        title: draft.title,
        summary: draft.summary,
        category: draft.category,
        authorName: draft.authorName,
        coverAlt: draft.coverAlt,
        blocks: draft.blocks.map(({ imageUrl, ...rest }) => rest),
      };
      // Editor reads include the existing key, so this safely round-trips an
      // untouched cover as well as a replacement uploaded in this session.
      if (draft.coverImageKey) body.coverImageKey = draft.coverImageKey;
      if (status) body.status = status;

      const res = await fetch(`/api/newsletters/${slugRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");

      setLetter(data);
      setDraft(draftFrom(data));
      setDirty(false);
      if (data.slug !== slugRef.current) {
        slugRef.current = data.slug;
        router.replace(`/member/newsletters/${data.slug}`);
      }
      return data;
    },
    [draft, router]
  );

  async function onSave() {
    setSaving(true);
    try {
      await save();
      toast.success("Saved");
    } catch (err: any) {
      toast.error(err.message || "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function onPublishToggle() {
    if (!letter) return;
    const next = letter.status === "published" ? "draft" : "published";
    setPublishing(true);
    try {
      const saved = await save(next);
      if (next === "published") {
        toast.success(
          saved?.status === "published"
            ? "Published. The chapter has been notified."
            : "Published."
        );
      } else {
        toast.success("Moved back to a draft. It is no longer public.");
      }
    } catch (err: any) {
      toast.error(err.message || "Could not change that");
    } finally {
      setPublishing(false);
    }
  }

  async function onCover(file: File | undefined) {
    if (!file) return;
    setUploadingCover(true);
    try {
      const result = await uploadNewsletterImage(file);
      patch({ coverImageKey: result.imageKey, coverImageUrl: result.imageUrl });
    } catch (err: any) {
      toast.error(err.message || "Could not upload that picture");
    } finally {
      setUploadingCover(false);
      if (coverInput.current) coverInput.current.value = "";
    }
  }

  async function onDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/newsletters/${slugRef.current}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete that newsletter");
      }
      toast.success("Deleted");
      router.push("/member/newsletters");
    } catch (err: any) {
      toast.error(err.message || "Could not delete that newsletter");
      setDeleting(false);
    }
  }

  // Cmd/Ctrl+S. An article is long enough that losing one to a closed tab is a
  // real loss, and the muscle memory is already there.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "s") return;
      event.preventDefault();
      if (!saving && dirty) onSave();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Unsaved work must not leave silently. The browser's own prompt is the only
  // one that can block a tab close.
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!viewer.loaded || (!letter && !loadError)) {
    return (
      <PageContainer>
        <LoadingState />
      </PageContainer>
    );
  }

  if (loadError || !letter || !draft) {
    return (
      <PageContainer>
        <ErrorState
          title="Newsletter unavailable"
          description={loadError ?? "That newsletter could not be loaded."}
          action={
            <Button variant="outline" asChild>
              <Link href="/member/newsletters">Back to newsletters</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  // A member who cannot edit came here to read it, which is a thing this page
  // can simply do. Telling them "not yours to edit" was true and useless.
  if (!isEditor) {
    return <NewsletterReader letter={letter} />;
  }

  const isPublished = letter.status === "published";

  return (
    <PageContainer>
      <PageHeader
        eyebrow={
          <Link
            href="/member/newsletters"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Newsletters
          </Link>
        }
        title={draft.title || "Untitled newsletter"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={isPublished ? "default" : "secondary"}>
              {isPublished ? "Published" : "Draft"}
            </Badge>
            {dirty ? (
              <span className="text-amber-600 dark:text-amber-500">
                Unsaved changes
              </span>
            ) : null}
            {isPublished ? (
              <span className="font-mono text-xs">/newsletters/{letter.slug}</span>
            ) : null}
          </span>
        }
        actions={
          <>
            <CopyLinkButton url={letter.shareUrl} disabled={!isPublished} />
            {isPublished ? (
              <Button variant="outline" asChild>
                <Link href={`/newsletters/${letter.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 size-4" aria-hidden="true" />
                  View
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={onSave} disabled={saving || !dirty}>
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="mr-2 size-4" aria-hidden="true" />
              )}
              Save
            </Button>
            <Button onClick={onPublishToggle} disabled={publishing}>
              {publishing ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              ) : isPublished ? (
                <EyeOff className="mr-2 size-4" aria-hidden="true" />
              ) : (
                <Eye className="mr-2 size-4" aria-hidden="true" />
              )}
              {isPublished ? "Unpublish" : "Publish"}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),20rem]">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="nl-title">Title</Label>
                <Input
                  id="nl-title"
                  value={draft.title}
                  onChange={(event) => patch({ title: event.target.value })}
                  placeholder="Headline"
                  className="text-lg font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nl-summary">Summary</Label>
                <Textarea
                  id="nl-summary"
                  value={draft.summary}
                  onChange={(event) => patch({ summary: event.target.value })}
                  placeholder="One or two lines, shown on the card and in a shared link. Optional."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <BlockEditor
            blocks={draft.blocks}
            onChange={(blocks) => patch({ blocks })}
          />
        </div>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="space-y-1.5">
                <Label>Cover picture</Label>
                {draft.coverImageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={draft.coverImageUrl}
                    alt={draft.coverAlt || "Cover"}
                    className="h-36 w-full rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-36 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                    No cover yet
                  </div>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => coverInput.current?.click()}
                  disabled={uploadingCover}
                >
                  {uploadingCover ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="mr-1.5 size-3.5" aria-hidden="true" />
                  )}
                  {draft.coverImageUrl ? "Replace cover" : "Choose cover"}
                </Button>
                <input
                  ref={coverInput}
                  type="file"
                  accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
                  className="hidden"
                  onChange={(event) => onCover(event.target.files?.[0])}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nl-cover-alt">Cover alt text</Label>
                <Input
                  id="nl-cover-alt"
                  value={draft.coverAlt}
                  onChange={(event) => patch({ coverAlt: event.target.value })}
                  placeholder="Describe the cover"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="nl-category">Category</Label>
                <Select
                  value={draft.category}
                  onValueChange={(value) => patch({ category: value })}
                >
                  <SelectTrigger id="nl-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NEWSLETTER_CATEGORIES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {CATEGORY_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nl-author">Byline</Label>
                <Input
                  id="nl-author"
                  value={draft.authorName}
                  onChange={(event) => patch({ authorName: event.target.value })}
                  placeholder="Corresponding Secretary"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <Button
                type="button"
                variant="ghost"
                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-2 size-4" aria-hidden="true" />
                Delete this newsletter
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{letter.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {isPublished
                ? "This issue is public. Deleting it removes the article, its pictures, and breaks any link that has already been shared. This cannot be undone."
                : "This draft and its pictures will be removed. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                onDelete();
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

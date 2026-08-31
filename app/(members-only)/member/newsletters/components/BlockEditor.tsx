"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Images,
  Info,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Pilcrow,
  Plus,
  Quote,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CALLOUT_VARIANTS,
  IMAGE_LAYOUTS,
  type BlockType,
  type CalloutVariant,
  type ImageLayout,
} from "@/lib/newsletterTypes";
import { prepareImageForUpload } from "@/lib/prepareImageUpload";

/// A block as the builder holds it.
///
/// `imageUrl` is presentation only and never posted back: the server stores
/// `imageKey` and mints a fresh signature on every read. Keeping both here is
/// what lets a picture appear the instant it uploads without a round trip to
/// re-read the article.
export interface DraftGalleryImage {
  imageKey?: string;
  imageUrl?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface DraftBlock {
  id: string;
  type: BlockType;
  text?: string;
  attribution?: string;
  items?: string[];
  ordered?: boolean;
  variant?: CalloutVariant;
  imageKey?: string;
  imageUrl?: string;
  caption?: string;
  alt?: string;
  credit?: string;
  layout?: ImageLayout;
  width?: number;
  height?: number;
  images?: DraftGalleryImage[];
}

export function newBlockId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const TYPE_META: Record<BlockType, { label: string; icon: typeof Pilcrow }> = {
  heading: { label: "Heading", icon: Heading1 },
  subheading: { label: "Subheading", icon: Heading2 },
  paragraph: { label: "Text", icon: Pilcrow },
  list: { label: "List", icon: List },
  quote: { label: "Quote", icon: Quote },
  callout: { label: "Callout", icon: Info },
  image: { label: "Picture", icon: ImageIcon },
  gallery: { label: "Gallery", icon: Images },
  divider: { label: "Divider", icon: Minus },
};

const ACCEPT = "image/jpeg,image/png,image/heic,image/heif,image/webp";

/// A dot in each callout tone's own colour, so the picker shows what the three
/// options actually produce rather than only naming them.
const CALLOUT_SWATCH: Record<CalloutVariant, string> = {
  note: "bg-muted-foreground",
  highlight: "bg-primary",
  warning: "bg-destructive",
};

/// Push one image to the bucket and hand back what the block needs.
export async function uploadNewsletterImage(file: File): Promise<{
  imageKey: string;
  imageUrl: string;
  width: number;
  height: number;
}> {
  // Shrunk here rather than sent whole: the server resizes to 2000px anyway,
  // and a camera original is large enough to be refused by the platform before
  // the route sees it. See lib/prepareImageUpload.
  const prepared = await prepareImageForUpload(file);
  const form = new FormData();
  form.append("file", prepared);
  const res = await fetch("/api/newsletters/images", {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not upload that picture");
  return data;
}

interface BlockEditorProps {
  blocks: DraftBlock[];
  onChange: (blocks: DraftBlock[]) => void;
}

export default function BlockEditor({ blocks, onChange }: BlockEditorProps) {
  /// Which block is being dragged, and which gap it is currently over.
  ///
  /// Held here rather than in each card because the drop target is the gap
  /// *between* two cards, and only the list knows where those are.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function update(id: string, patch: Partial<DraftBlock>) {
    onChange(blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)));
  }

  function remove(id: string) {
    onChange(blocks.filter((block) => block.id !== id));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= blocks.length || from === to) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  function insert(type: BlockType, at: number, extra?: Partial<DraftBlock>) {
    const base: DraftBlock = { id: newBlockId(), type, ...defaultsFor(type), ...extra };
    const next = [...blocks];
    next.splice(at, 0, base);
    onChange(next);
  }

  function handleDrop(targetIndex: number) {
    const from = blocks.findIndex((block) => block.id === draggingId);
    setDraggingId(null);
    setOverIndex(null);
    if (from < 0) return;
    // The gap index counts positions, not blocks: dropping into the gap after
    // the block you picked up is a no-op, and everything past the origin
    // shifts back by one once it is lifted out.
    const to = targetIndex > from ? targetIndex - 1 : targetIndex;
    move(from, to);
  }

  return (
    <div className="space-y-1">
      {blocks.map((block, index) => (
        <div key={block.id}>
          <DropGap
            active={draggingId !== null && overIndex === index}
            onEnter={() => setOverIndex(index)}
            onDrop={() => handleDrop(index)}
          />
          <BlockCard
            block={block}
            index={index}
            total={blocks.length}
            isDragging={draggingId === block.id}
            onDragStart={() => setDraggingId(block.id)}
            onDragEnd={() => {
              setDraggingId(null);
              setOverIndex(null);
            }}
            onUpdate={(patch) => update(block.id, patch)}
            onRemove={() => remove(block.id)}
            onMove={(delta) => move(index, index + delta)}
          />
        </div>
      ))}

      <DropGap
        active={draggingId !== null && overIndex === blocks.length}
        onEnter={() => setOverIndex(blocks.length)}
        onDrop={() => handleDrop(blocks.length)}
      />

      <AddBlockBar onAdd={(type, extra) => insert(type, blocks.length, extra)} />
    </div>
  );
}

function defaultsFor(type: BlockType): Partial<DraftBlock> {
  switch (type) {
    case "list":
      return { items: [""], ordered: false };
    case "callout":
      return { text: "", variant: "note" };
    case "image":
      return { layout: "standard" };
    case "gallery":
      return { images: [] };
    default:
      return { text: "" };
  }
}

/// The landing strip between two blocks.
///
/// A zero-height element with generous padding rather than a visible bar: it
/// has to be easy to hit while dragging and invisible the rest of the time,
/// and a gap that reserves height would push the whole list around whenever a
/// drag started.
function DropGap({
  active,
  onEnter,
  onDrop,
}: {
  active: boolean;
  onEnter: () => void;
  onDrop: () => void;
}) {
  return (
    <div
      onDragOver={(event) => {
        // Without this the browser refuses the drop outright.
        event.preventDefault();
        onEnter();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className="h-2 py-[3px]"
      aria-hidden="true"
    >
      <div
        className={`h-[2px] rounded-full transition-colors ${
          active ? "bg-primary" : "bg-transparent"
        }`}
      />
    </div>
  );
}

function AddBlockBar({
  onAdd,
}: {
  onAdd: (type: BlockType, extra?: Partial<DraftBlock>) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadNewsletterImage(file);
      onAdd("image", { ...result, caption: "", alt: "", layout: "standard" });
    } catch (err: any) {
      toast.error(err.message || "Could not upload that picture");
    } finally {
      setUploading(false);
      // Cleared so choosing the same file twice in a row still fires a change.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function pickGallery(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        Array.from(files).slice(0, 12).map((file) => uploadNewsletterImage(file))
      );
      onAdd("gallery", {
        images: uploaded.map((image) => ({ ...image, alt: "", caption: "" })),
      });
    } catch (err: any) {
      toast.error(err.message || "Could not upload those pictures");
    } finally {
      setUploading(false);
      if (galleryInput.current) galleryInput.current.value = "";
    }
  }

  const simple: Array<[BlockType, string]> = [
    ["paragraph", "Text"],
    ["heading", "Heading"],
    ["subheading", "Subheading"],
    ["list", "List"],
    ["quote", "Quote"],
    ["callout", "Callout"],
    ["divider", "Divider"],
  ];

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border bg-card/40 p-2.5">
      <Plus className="mr-0.5 size-3.5 text-muted-foreground" aria-hidden="true" />
      {simple.map(([type, label]) => {
        const Icon = TYPE_META[type].icon;
        return (
          <Button
            key={type}
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2.5"
            onClick={() => onAdd(type)}
          >
            <Icon className="mr-1.5 size-3.5" aria-hidden="true" />
            {label}
          </Button>
        );
      })}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 px-2.5"
        onClick={() => fileInput.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <ImageIcon className="mr-1.5 size-3.5" aria-hidden="true" />
        )}
        Picture
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 px-2.5"
        onClick={() => galleryInput.current?.click()}
        disabled={uploading}
      >
        <Images className="mr-1.5 size-3.5" aria-hidden="true" />
        Gallery
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => pickImage(event.target.files?.[0])}
      />
      <input
        ref={galleryInput}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => pickGallery(event.target.files)}
      />
    </div>
  );
}

function BlockCard({
  block,
  index,
  total,
  isDragging,
  onDragStart,
  onDragEnd,
  onUpdate,
  onRemove,
  onMove,
}: {
  block: DraftBlock;
  index: number;
  total: number;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onUpdate: (patch: Partial<DraftBlock>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const meta = TYPE_META[block.type];
  const Icon = meta.icon;
  // Only the handle is draggable. Making the whole card draggable meant a
  // click into a textarea started a drag and selecting a word was impossible.
  const [handleHeld, setHandleHeld] = useState(false);

  return (
    <div
      draggable={handleHeld}
      onDragStart={(event) => {
        // Firefox ignores a drag with no payload.
        event.dataTransfer.setData("text/plain", block.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={() => {
        setHandleHeld(false);
        onDragEnd();
      }}
      className={`rounded-lg border bg-card transition-opacity ${
        isDragging ? "border-primary opacity-40" : "border-border"
      }`}
    >
      <div className="flex items-center gap-1.5 px-2 pt-2">
        <button
          type="button"
          onMouseDown={() => setHandleHeld(true)}
          onMouseUp={() => setHandleHeld(false)}
          onTouchStart={() => setHandleHeld(true)}
          className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={`Drag to move ${meta.label}`}
          tabIndex={-1}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>

        <div className="ml-auto flex items-center gap-0.5">
          {/* Kept alongside the drag handle rather than replaced by it. A
              drag-only list cannot be reordered from a keyboard at all, which
              locks out anyone who does not use a mouse. */}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move ${meta.label} up`}
          >
            <ArrowUp className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Move ${meta.label} down`}
          >
            <ArrowDown className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRemove}
            aria-label={`Delete ${meta.label}`}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="px-3 pb-3 pt-2">
        <BlockBody block={block} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

function BlockBody({
  block,
  onUpdate,
}: {
  block: DraftBlock;
  onUpdate: (patch: Partial<DraftBlock>) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const addToGallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function replace(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onUpdate(await uploadNewsletterImage(file));
    } catch (err: any) {
      toast.error(err.message || "Could not upload that picture");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function appendImages(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const uploaded = await Promise.all(
        Array.from(files).slice(0, 12).map((file) => uploadNewsletterImage(file))
      );
      onUpdate({
        images: [
          ...(block.images ?? []),
          ...uploaded.map((image) => ({ ...image, alt: "", caption: "" })),
        ].slice(0, 12),
      });
    } catch (err: any) {
      toast.error(err.message || "Could not upload those pictures");
    } finally {
      setBusy(false);
      if (addToGallery.current) addToGallery.current.value = "";
    }
  }

  switch (block.type) {
    case "divider":
      return <hr className="my-1 border-border" />;

    case "heading":
      return (
        <Input
          value={block.text ?? ""}
          onChange={(event) => onUpdate({ text: event.target.value })}
          placeholder="Section heading"
          className="text-lg font-semibold"
        />
      );

    case "subheading":
      return (
        <Input
          value={block.text ?? ""}
          onChange={(event) => onUpdate({ text: event.target.value })}
          placeholder="Smaller heading"
          className="font-semibold uppercase tracking-wide"
        />
      );

    case "paragraph":
      return (
        <Textarea
          value={block.text ?? ""}
          onChange={(event) => onUpdate({ text: event.target.value })}
          placeholder="Write the paragraph."
          rows={5}
          className="resize-y"
        />
      );

    case "list":
      return <ListBody block={block} onUpdate={onUpdate} />;

    case "quote":
      return (
        <div className="space-y-2">
          <Textarea
            value={block.text ?? ""}
            onChange={(event) => onUpdate({ text: event.target.value })}
            placeholder="The quote"
            rows={2}
            className="resize-y italic"
          />
          <Input
            value={block.attribution ?? ""}
            onChange={(event) => onUpdate({ attribution: event.target.value })}
            placeholder="Who said it"
          />
        </div>
      );

    case "callout":
      return (
        <div className="space-y-2">
          <Textarea
            value={block.text ?? ""}
            onChange={(event) => onUpdate({ text: event.target.value })}
            placeholder="Something worth pulling out of the flow"
            rows={3}
            className="resize-y"
          />
          <SegmentedControl
            value={block.variant ?? "note"}
            options={CALLOUT_VARIANTS.map((variant) => ({
              value: variant,
              label: variant[0].toUpperCase() + variant.slice(1),
              swatch: CALLOUT_SWATCH[variant],
            }))}
            onChange={(value) => onUpdate({ variant: value as CalloutVariant })}
          />
        </div>
      );

    case "image":
      return (
        <div className="space-y-3">
          {block.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={block.imageUrl}
              alt={block.alt || "Newsletter picture"}
              className="max-h-72 w-full rounded-md object-cover"
            />
          ) : (
            <div className="flex h-28 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
              Picture not loaded
            </div>
          )}

          <SegmentedControl
            value={block.layout ?? "standard"}
            options={IMAGE_LAYOUTS.map((layout) => ({
              value: layout,
              label: layout[0].toUpperCase() + layout.slice(1),
            }))}
            onChange={(value) => onUpdate({ layout: value as ImageLayout })}
          />

          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              value={block.caption ?? ""}
              onChange={(event) => onUpdate({ caption: event.target.value })}
              placeholder="Caption"
            />
            <Input
              value={block.credit ?? ""}
              onChange={(event) => onUpdate({ credit: event.target.value })}
              placeholder="Photo credit"
            />
            {/* Separate from the caption on purpose. A caption is for
                everyone; alt text is for the people who cannot see the
                picture, and reusing one as the other leaves them with either
                nothing or a duplicate. */}
            <Input
              value={block.alt ?? ""}
              onChange={(event) => onUpdate({ alt: event.target.value })}
              placeholder="Alt text"
            />
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="mr-1.5 size-3.5" aria-hidden="true" />
            )}
            Replace
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => replace(event.target.files?.[0])}
          />
        </div>
      );

    case "gallery":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {(block.images ?? []).map((image, index) => (
              <div key={index} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.imageUrl}
                  alt={image.alt || ""}
                  className="aspect-[4/3] w-full rounded-md object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    onUpdate({
                      images: (block.images ?? []).filter((_, i) => i !== index),
                    })
                  }
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-destructive opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                  aria-label={`Remove picture ${index + 1}`}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
                <Input
                  value={image.alt ?? ""}
                  onChange={(event) =>
                    onUpdate({
                      images: (block.images ?? []).map((item, i) =>
                        i === index ? { ...item, alt: event.target.value } : item
                      ),
                    })
                  }
                  placeholder="Alt text"
                  className="mt-1 h-7 text-xs"
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => addToGallery.current?.click()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
              )}
              Add pictures
            </Button>
            <Input
              value={block.caption ?? ""}
              onChange={(event) => onUpdate({ caption: event.target.value })}
              placeholder="Gallery caption"
              className="max-w-xs"
            />
          </div>
          <input
            ref={addToGallery}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(event) => appendImages(event.target.files)}
          />
        </div>
      );

    default:
      return null;
  }
}

function ListBody({
  block,
  onUpdate,
}: {
  block: DraftBlock;
  onUpdate: (patch: Partial<DraftBlock>) => void;
}) {
  const items = block.items ?? [""];
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  /// Which row to put the caret in once React has drawn it.
  ///
  /// Focus cannot be moved in the same tick as the insert: the input for the
  /// new row does not exist yet, so `inputs.current[index + 1]` is undefined
  /// and the caret stays where it was. Pressing Enter added a row and left you
  /// typing into the previous one. Recording the intent and acting on it after
  /// the render is what makes the list behave like every other list editor.
  const [focusRow, setFocusRow] = useState<number | null>(null);

  useEffect(() => {
    if (focusRow === null) return;
    const input = inputs.current[focusRow];
    if (input) {
      input.focus();
      // Caret at the end rather than selecting the text, which is what
      // happens when a row is merged into rather than created empty.
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
    setFocusRow(null);
  }, [focusRow, items.length]);

  function setItem(index: number, value: string) {
    onUpdate({ items: items.map((item, i) => (i === index ? value : item)) });
  }

  function addAfter(index: number) {
    const next = [...items];
    next.splice(index + 1, 0, "");
    onUpdate({ items: next });
    setFocusRow(index + 1);
  }

  function removeAt(index: number) {
    if (items.length <= 1) {
      onUpdate({ items: [""] });
      setFocusRow(0);
      return;
    }
    onUpdate({ items: items.filter((_, i) => i !== index) });
    setFocusRow(Math.max(0, index - 1));
  }

  return (
    <div className="space-y-2">
      <SegmentedControl
        value={block.ordered ? "ordered" : "bulleted"}
        options={[
          { value: "bulleted", label: "Bulleted", icon: List },
          { value: "ordered", label: "Numbered", icon: ListOrdered },
        ]}
        onChange={(value) => onUpdate({ ordered: value === "ordered" })}
      />
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-4 shrink-0 text-center text-xs text-muted-foreground">
            {block.ordered ? `${index + 1}.` : "•"}
          </span>
          <Input
            ref={(node) => {
              inputs.current[index] = node;
            }}
            value={item}
            onChange={(event) => setItem(index, event.target.value)}
            placeholder="List item"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addAfter(index);
                return;
              }
              // Backspace on an empty row removes it and puts the caret back
              // on the row above, which is how you expect to walk a list back.
              if (event.key === "Backspace" && item === "" && items.length > 1) {
                event.preventDefault();
                removeAt(index);
                return;
              }
              // Arrow keys move between rows once the caret is already at the
              // end the arrow points toward, so they still move the caret
              // inside a row that has text in it.
              const input = event.currentTarget;
              if (event.key === "ArrowDown" && input.selectionStart === item.length) {
                if (index < items.length - 1) {
                  event.preventDefault();
                  setFocusRow(index + 1);
                }
              }
              if (event.key === "ArrowUp" && input.selectionStart === 0) {
                if (index > 0) {
                  event.preventDefault();
                  setFocusRow(index - 1);
                }
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 text-muted-foreground"
            onClick={() => removeAt(index)}
            aria-label={`Remove item ${index + 1}`}
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7"
        onClick={() => addAfter(items.length - 1)}
      >
        <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
        Add item
      </Button>
    </div>
  );
}

/// A small row of mutually exclusive choices.
///
/// Not a `Select`: there are two or three options, they are short, and a
/// dropdown to pick between "Bulleted" and "Numbered" is a click and a menu
/// for something that should be one click.
///
/// The selected segment is a filled chip rather than a raised white one. The
/// raised treatment is what shadcn's tabs use and it works on a page with a
/// grey ground, but these sit on a card whose background is already white, so
/// "selected" and "not selected" rendered as the same colour and there was no
/// way to tell which callout tone was active.
function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string; icon?: typeof List; swatch?: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-muted p-0.5">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            }`}
          >
            {/* The tone's own colour, so the three callout options are
                distinguishable by what they do and not only by their names. */}
            {option.swatch ? (
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ring-1 ring-inset ring-black/10 ${option.swatch}`}
              />
            ) : null}
            {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

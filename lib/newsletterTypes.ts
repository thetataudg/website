// lib/newsletterTypes.ts
// The shape of an article, and every rule about it that does not need a
// database or a storage bucket to enforce.
//
// Split out of `lib/newsletters.ts` because the builder is a client component
// and imports the category list from here. When these lived in the same module
// as the Mongoose model, importing one constant pulled Mongoose into the
// browser bundle, where `models` is undefined and the page died on load with
// "Cannot read properties of undefined (reading 'Newsletter')".
//
// The rule this file enforces: nothing in here may import a model, a storage
// client, or Clerk. Anything that needs one of those belongs in
// `lib/newsletters.ts`, which is server-only.

export const NEWSLETTER_CATEGORIES = [
  "chapter",
  "brotherhood",
  "professional",
  "service",
] as const;

export type NewsletterCategory = (typeof NEWSLETTER_CATEGORIES)[number];

export const BLOCK_TYPES = [
  "heading",
  "subheading",
  "paragraph",
  "list",
  "quote",
  "callout",
  "image",
  "gallery",
  "divider",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/// How wide a picture runs.
///
/// "standard" sits in the text column. "wide" breaks out a little either side,
/// which is what a news site does for a photo worth looking at. "full" runs to
/// the edge of the sheet. Anything unrecognised falls back to standard rather
/// than failing, so a layout added later degrades instead of breaking.
export const IMAGE_LAYOUTS = ["standard", "wide", "full"] as const;
export type ImageLayout = (typeof IMAGE_LAYOUTS)[number];

/// The tone of a callout box.
export const CALLOUT_VARIANTS = ["note", "highlight", "warning"] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

/// One picture inside a gallery.
export interface GalleryImage {
  imageKey?: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface SerializedGalleryImage extends Omit<GalleryImage, "imageKey"> {
  /// Present only in authenticated editor responses. Public readers receive
  /// the signed URL without learning how the object is stored.
  imageKey?: string;
  imageUrl?: string;
}

export interface NewsletterBlock {
  id: string;
  type: BlockType;
  text?: string;
  attribution?: string;
  /// list: the lines. Stored as an array rather than one string with newlines
  /// so reordering and rendering do not both have to agree on a separator.
  items?: string[];
  /// list: numbered rather than bulleted.
  ordered?: boolean;
  /// callout: which tone to draw it in.
  variant?: CalloutVariant;
  /// Stored form. Never sent to a reader — see `SerializedBlock.imageUrl`.
  imageKey?: string;
  caption?: string;
  alt?: string;
  /// image: photographer or source, printed small under the picture. News
  /// outlets credit photos and a chapter newsletter that runs somebody's
  /// photography should too.
  credit?: string;
  layout?: ImageLayout;
  width?: number;
  height?: number;
  /// gallery: two or more pictures shown as a grid.
  images?: GalleryImage[];
}

/// What a reader receives: the same block with every key resolved to a URL it
/// can actually fetch.
export interface SerializedBlock
  extends Omit<NewsletterBlock, "imageKey" | "images"> {
  /// Present only in authenticated editor responses. The builder needs this
  /// to preserve an untouched image when it saves the rest of the article.
  imageKey?: string;
  imageUrl?: string;
  images?: SerializedGalleryImage[];
}

export interface SerializedNewsletter {
  id: string;
  title: string;
  slug: string;
  /// Exactly what the author wrote, and empty when they wrote nothing.
  ///
  /// Never back-filled from the article. The first paragraph was being copied
  /// in here when the field was left blank, which meant the article page drew
  /// it as a lede immediately above the identical opening paragraph. A summary
  /// the author did not write is not a summary.
  summary: string;
  /// What to show where something has to appear: a card, a link preview, the
  /// email. Falls back to the opening of the article, because a card with no
  /// text at all is worse than a truncated one. Not used as the lede.
  excerpt: string;
  category: NewsletterCategory;
  coverImageUrl: string;
  /// Present only in authenticated editor responses. Public feeds and article
  /// reads never expose storage keys.
  coverImageKey?: string;
  coverAlt: string;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string | null;
  authorName: string;
  readingMinutes: number;
  /// Absolute, so the app and the website hand out the identical link when
  /// somebody taps Share.
  shareUrl: string;
  /// Omitted from list responses. A feed of twenty articles does not need
  /// twenty bodies, and each image block costs a signature to produce.
  blocks?: SerializedBlock[];
}

/// Caps. Generous enough that nobody writing in good faith meets one, tight
/// enough that a malformed or hostile payload cannot put a megabyte of text
/// into a document every member's phone downloads.
export const LIMITS = {
  title: 160,
  summary: 400,
  blocks: 200,
  text: 20_000,
  listItems: 60,
  galleryImages: 12,
  caption: 400,
  alt: 400,
  attribution: 160,
  credit: 160,
} as const;

/// A URL-safe form of the title: "Rush week, start to finish" → "rush-week-start-to-finish".
///
/// Unicode is folded to ASCII rather than percent-encoded, because the slug is
/// something people read in a text message and type by hand.
export function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    // Strip combining marks, so "é" has already become "e" + accent and the
    // accent goes here.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base || "newsletter";
}

const clamp = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const positiveInt = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

/// Coerce whatever the builder posted into blocks worth storing.
///
/// Every field is rebuilt rather than spread, so a client cannot smuggle an
/// extra key into the document. Blocks that carry nothing — an empty paragraph
/// somebody tabbed past, an image block whose upload failed — are dropped
/// rather than saved, because they render as a gap the reader cannot explain.
export function normalizeBlocks(input: unknown): NewsletterBlock[] {
  if (!Array.isArray(input)) return [];

  const out: NewsletterBlock[] = [];
  for (const raw of input.slice(0, LIMITS.blocks)) {
    if (!raw || typeof raw !== "object") continue;
    const source = raw as Record<string, unknown>;
    const type = source.type;
    if (typeof type !== "string" || !(BLOCK_TYPES as readonly string[]).includes(type)) {
      continue;
    }

    const id =
      clamp(source.id, 64) ||
      `b-${out.length}-${Math.random().toString(36).slice(2, 8)}`;

    switch (type as BlockType) {
      case "divider":
        out.push({ id, type: "divider" });
        break;

      case "image": {
        const imageKey = clamp(source.imageKey, 512);
        if (!imageKey) break;
        out.push({
          id,
          type: "image",
          imageKey,
          caption: clamp(source.caption, LIMITS.caption),
          alt: clamp(source.alt, LIMITS.alt),
          credit: clamp(source.credit, LIMITS.credit),
          layout: (IMAGE_LAYOUTS as readonly string[]).includes(
            source.layout as string
          )
            ? (source.layout as ImageLayout)
            : "standard",
          width: positiveInt(source.width),
          height: positiveInt(source.height),
        });
        break;
      }

      case "gallery": {
        const images = Array.isArray(source.images)
          ? source.images
              .slice(0, LIMITS.galleryImages)
              .map((entry): GalleryImage | null => {
                if (!entry || typeof entry !== "object") return null;
                const item = entry as Record<string, unknown>;
                const imageKey = clamp(item.imageKey, 512);
                if (!imageKey) return null;
                return {
                  imageKey,
                  alt: clamp(item.alt, LIMITS.alt),
                  caption: clamp(item.caption, LIMITS.caption),
                  width: positiveInt(item.width),
                  height: positiveInt(item.height),
                };
              })
              .filter((item): item is GalleryImage => item !== null)
          : [];
        // A gallery with nothing in it is a gap the reader cannot explain.
        if (!images.length) break;
        out.push({
          id,
          type: "gallery",
          images,
          caption: clamp(source.caption, LIMITS.caption),
        });
        break;
      }

      case "list": {
        const items = Array.isArray(source.items)
          ? source.items
              .slice(0, LIMITS.listItems)
              .map((item) => clamp(item, LIMITS.caption))
              .filter((item) => item.length > 0)
          : [];
        if (!items.length) break;
        out.push({
          id,
          type: "list",
          items,
          ordered: source.ordered === true,
        });
        break;
      }

      case "callout": {
        const text = clamp(source.text, LIMITS.text);
        if (!text) break;
        out.push({
          id,
          type: "callout",
          text,
          variant: (CALLOUT_VARIANTS as readonly string[]).includes(
            source.variant as string
          )
            ? (source.variant as CalloutVariant)
            : "note",
        });
        break;
      }

      case "quote": {
        const text = clamp(source.text, LIMITS.text);
        if (!text) break;
        out.push({
          id,
          type: "quote",
          text,
          attribution: clamp(source.attribution, LIMITS.attribution),
        });
        break;
      }

      default: {
        // heading, subheading, paragraph.
        const text = clamp(source.text, LIMITS.text);
        if (!text) break;
        out.push({ id, type: type as BlockType, text });
        break;
      }
    }
  }

  return out;
}

/// Every image key a block owns, gallery members included.
///
/// Exists so orphan cleanup has one place to ask. When galleries were added,
/// the delete path still only looked at `imageKey` and every picture in a
/// deleted gallery stayed in the bucket forever.
export function imageKeysIn(blocks: NewsletterBlock[]): string[] {
  const keys: string[] = [];
  for (const block of blocks) {
    if (block.imageKey) keys.push(block.imageKey);
    for (const image of block.images ?? []) {
      if (image.imageKey) keys.push(image.imageKey);
    }
  }
  return keys;
}

/// Every readable word in the article, for reading time and for the fallback
/// summary. Captions are included: they are read.
export function plainText(blocks: NewsletterBlock[] | SerializedBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "divider":
          return "";
        case "image":
          return [block.caption, block.credit].filter(Boolean).join(" ");
        case "gallery":
          return [
            block.caption,
            ...(block.images ?? []).map((image) => image.caption ?? ""),
          ]
            .filter(Boolean)
            .join(" ");
        case "list":
          return (block.items ?? []).join(" ");
        default:
          return [block.text, block.attribution].filter(Boolean).join(" ");
      }
    })
    .filter(Boolean)
    .join(" ");
}

/// Roughly how long it takes to read, at the 220 words a minute most estimates
/// settle on. Rounded up, because "1 min read" is friendlier than "0".
export function readingMinutes(blocks: NewsletterBlock[] | SerializedBlock[]): number {
  const words = plainText(blocks).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

/// The first line of the article, when nobody wrote a summary. A truncated
/// opening is a worse card than a written one, but it beats an empty card.
export function fallbackSummary(blocks: NewsletterBlock[]): string {
  const paragraph = blocks.find(
    (block) => block.type === "paragraph" && (block.text ?? "").trim()
  );
  const text = (paragraph?.text ?? "").trim();
  if (text.length <= 180) return text;
  const cut = text.slice(0, 180);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 120 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/// The public address of one issue.
export function newsletterPath(slug: string): string {
  return `/newsletters/${slug}`;
}

// lib/newsletters.ts
// The server half of an article: the two operations that need something more
// than the payload itself.
//
// Everything that is pure — the category list, the block shape, the caps, the
// slug rules, reading time — lives in `lib/newsletterTypes.ts` and is safe to
// import from a client component. This module is not: it reaches for the
// Mongoose model and the storage client, so importing it from the browser
// bundles both.
//
// The pure module is re-exported so server code has one import to reach for.
import Newsletter from "@/lib/models/Newsletter";
import { signNewsletterImage } from "@/lib/newsletterStorage";
import {
  fallbackSummary,
  imageKeysIn,
  newsletterPath,
  readingMinutes,
  slugify,
  type NewsletterBlock,
  type NewsletterCategory,
  type SerializedBlock,
  type SerializedNewsletter,
} from "@/lib/newsletterTypes";

export * from "@/lib/newsletterTypes";

/// `slugify`, then walk forward until nothing else owns it.
///
/// The database has a unique index on `slug`, so this is a courtesy that
/// produces a readable second slug rather than the guard — a race between two
/// officers publishing at the same instant still fails at the index, which is
/// where it should fail.
export async function uniqueSlug(
  title: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(title);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await Newsletter.findOne({ slug: candidate })
      .select("_id")
      .lean<any>();
    if (!clash || (excludeId && String(clash._id) === String(excludeId))) {
      return candidate;
    }
  }
  return `${base}-${Date.now().toString(36)}`;
}

interface SerializeOptions {
  /// Absolute origin, from `siteUrl()`. Passed in rather than imported so this
  /// module stays usable from a script that has no request context.
  origin: string;
  /// List responses leave the body out; the article page and the app's reader
  /// ask for it.
  includeBlocks?: boolean;
  /// Editors must round-trip object keys when saving an otherwise untouched
  /// image. This is never enabled for a public feed or article response.
  includeStorageKeys?: boolean;
}

/// One stored document as the JSON both readers decode.
///
/// Image keys become signed URLs here and nowhere else, which is what keeps
/// the storage layout — and the bucket name — off the wire.
export async function serializeNewsletter(
  doc: any,
  { origin, includeBlocks = false, includeStorageKeys = false }: SerializeOptions
): Promise<SerializedNewsletter> {
  const blocks: NewsletterBlock[] = Array.isArray(doc.blocks) ? doc.blocks : [];

  // The cover falls back to the first picture in the article. An issue whose
  // author never set one still gets a card with a photo on it and a link
  // preview worth sharing, which is the whole point of the field.
  const coverKey =
    doc.coverImageKey ||
    // The first picture anywhere in the article, gallery members included.
    imageKeysIn(blocks)[0] ||
    "";

  const [coverImageUrl, serializedBlocks] = await Promise.all([
    signNewsletterImage(coverKey),
    includeBlocks
      ? Promise.all(
          blocks.map(async (block): Promise<SerializedBlock> => {
            const { imageKey, images, ...rest } = block;
            if (block.type === "image") {
              return {
                ...rest,
                ...(includeStorageKeys && imageKey ? { imageKey } : {}),
                imageUrl: await signNewsletterImage(imageKey ?? ""),
              };
            }
            if (block.type === "gallery") {
              return {
                ...rest,
                images: await Promise.all(
                  (images ?? []).map(async (image) => {
                    const { imageKey: key, ...imageRest } = image;
                    return {
                      ...imageRest,
                      ...(includeStorageKeys && key ? { imageKey: key } : {}),
                      imageUrl: await signNewsletterImage(key ?? ""),
                    };
                  })
                ),
              };
            }
            return rest;
          })
        )
      : Promise.resolve(undefined),
  ]);

  return {
    id: String(doc._id),
    title: doc.title ?? "",
    slug: doc.slug ?? "",
    summary: doc.summary ?? "",
    excerpt: doc.summary || fallbackSummary(blocks),
    category: (doc.category ?? "chapter") as NewsletterCategory,
    coverImageUrl,
    ...(includeStorageKeys && doc.coverImageKey
      ? { coverImageKey: String(doc.coverImageKey) }
      : {}),
    coverAlt: doc.coverAlt || doc.title || "",
    status: doc.status === "published" ? "published" : "draft",
    publishedAt: doc.publishedAt ? new Date(doc.publishedAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    authorName: doc.authorName || "Corresponding Secretary",
    readingMinutes: readingMinutes(blocks),
    shareUrl: `${origin}${newsletterPath(doc.slug ?? "")}`,
    ...(serializedBlocks ? { blocks: serializedBlocks } : {}),
  };
}

// scripts/check-newsletters.ts
// Guards the round trip an editor's save makes.
//
// The bug this exists for: `serializeNewsletter` strips `imageKey` so a public
// reader never sees the storage layout, and the builder posts back whatever it
// was handed. With the key gone, `normalizeBlocks` saw an image block with no
// key, dropped it as empty, and every picture in the article vanished the first
// time anybody hit Save. It looked like the layout buttons were broken, because
// changing a layout was the first thing anyone saved after loading.
//
// Run with `npm run check:newsletters`. No database required.
import { serializeNewsletter } from "../lib/newsletters";
import {
  normalizeBlocks,
  plainText,
  readingMinutes,
  slugify,
  imageKeysIn,
  type NewsletterBlock,
} from "../lib/newsletterTypes";

let failures = 0;

async function main() {

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/// What the article looks like in Mongo.
const stored: NewsletterBlock[] = [
  { id: "a", type: "paragraph", text: "Opening line." },
  {
    id: "b",
    type: "image",
    imageKey: "newsletters/photo.jpg",
    layout: "standard",
    caption: "A caption",
    credit: "A credit",
    alt: "Alt text",
    width: 1600,
    height: 900,
  },
  {
    id: "c",
    type: "gallery",
    caption: "Four events",
    images: [
      { imageKey: "newsletters/one.jpg", alt: "One", width: 800, height: 600 },
      { imageKey: "newsletters/two.jpg", alt: "Two", width: 800, height: 600 },
    ],
  },
  { id: "d", type: "list", ordered: true, items: ["First", "Second"] },
  { id: "e", type: "callout", variant: "warning", text: "Careful." },
  { id: "f", type: "divider" },
];

/// What the builder posts: signed URLs dropped, storage keys kept.
function asEditorWouldPost(
  blocks: NewsletterBlock[],
  edit?: (blocks: any[]) => void
) {
  const posted = blocks.map((block) => ({
    ...block,
    imageUrl: "https://signed.example/expires-soon",
    images: block.images?.map((image) => ({
      ...image,
      imageUrl: "https://signed.example/expires-soon",
    })),
  }));
  edit?.(posted);
  return posted;
}

console.log("\nEditor save round trip");
{
  const saved = normalizeBlocks(asEditorWouldPost(stored));
  check("every block survives a save", saved.length === stored.length,
    `${saved.length} of ${stored.length}`);
  check("the image keeps its key",
    saved.find((b) => b.id === "b")?.imageKey === "newsletters/photo.jpg");
  check("the gallery keeps both pictures",
    saved.find((b) => b.id === "c")?.images?.length === 2);
  check("signed URLs are not persisted",
    !JSON.stringify(saved).includes("signed.example"));
}

console.log("\nChanging an image layout");
for (const layout of ["standard", "wide", "full"] as const) {
  const saved = normalizeBlocks(
    asEditorWouldPost(stored, (blocks) => {
      blocks[1].layout = layout;
    })
  );
  const image = saved.find((b) => b.id === "b");
  check(`layout "${layout}" sticks and keeps the picture`,
    image?.layout === layout && image?.imageKey === "newsletters/photo.jpg",
    `got layout=${image?.layout} key=${image?.imageKey}`);
}

console.log("\nA reader's copy cannot be saved back");
{
  // Exactly what a *public* response contains: no keys at all. This must drop
  // the images rather than write empty ones, which is why the editor response
  // has to include the keys.
  const publicCopy = stored.map(({ imageKey, images, ...rest }) => ({
    ...rest,
    imageUrl: "https://signed.example/x",
    images: images?.map(({ imageKey: _k, ...img }) => img),
  }));
  const saved = normalizeBlocks(publicCopy);
  check("keyless image and gallery are dropped, not stored empty",
    !saved.some((b) => b.type === "image" || b.type === "gallery"));
}

console.log("\nValidation");
{
  check("unknown block types are refused",
    normalizeBlocks([{ id: "x", type: "iframe", text: "hi" }]).length === 0);
  check("empty paragraphs are refused",
    normalizeBlocks([{ id: "x", type: "paragraph", text: "   " }]).length === 0);
  check("empty lists are refused",
    normalizeBlocks([{ id: "x", type: "list", items: ["", "  "] }]).length === 0);
  check("an unknown image layout falls back to standard",
    normalizeBlocks([
      { id: "x", type: "image", imageKey: "k.jpg", layout: "parallax" },
    ])[0]?.layout === "standard");
  check("an unknown callout variant falls back to note",
    normalizeBlocks([
      { id: "x", type: "callout", text: "hi", variant: "danger" },
    ])[0]?.variant === "note");
  check("extra keys cannot be smuggled in",
    !("evil" in (normalizeBlocks([
      { id: "x", type: "paragraph", text: "hi", evil: "yes" },
    ])[0] as any)));
}

console.log("\nWhat each audience is told");
{
  // The other half of the same bug: the serializer is what decides whether a
  // storage key ever leaves the server. A public reader must not receive one,
  // and an editor must, or their next save wipes the pictures.
  const doc = {
    _id: "000000000000000000000001",
    title: "An issue",
    slug: "an-issue",
    summary: "",
    category: "chapter",
    coverImageKey: "newsletters/cover.jpg",
    coverAlt: "Cover",
    status: "published",
    publishedAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-02T00:00:00Z"),
    authorName: "Corresponding Secretary",
    blocks: stored,
  };
  const opts = { origin: "https://ttdg.org", includeBlocks: true };

  const publicCopy = await serializeNewsletter(doc, opts);
  check("public response hides the cover key",
    (publicCopy as any).coverImageKey === undefined);
  check("public response hides an inline image key",
    (publicCopy.blocks?.[1] as any)?.imageKey === undefined);
  check("public response hides gallery keys",
    ((publicCopy.blocks?.[2] as any)?.images ?? []).every(
      (i: any) => i.imageKey === undefined));

  const editorCopy = await serializeNewsletter(doc, {
    ...opts,
    includeStorageKeys: true,
  });
  check("editor response keeps the cover key",
    (editorCopy as any).coverImageKey === "newsletters/cover.jpg");
  check("editor response keeps an inline image key",
    (editorCopy.blocks?.[1] as any)?.imageKey === "newsletters/photo.jpg");
  check("editor response keeps gallery keys",
    ((editorCopy.blocks?.[2] as any)?.images ?? []).map((i: any) => i.imageKey)
      .join(",") === "newsletters/one.jpg,newsletters/two.jpg");

  // The whole round trip, as it actually happens.
  const resaved = normalizeBlocks(editorCopy.blocks);
  check("an editor response saved straight back keeps every picture",
    imageKeysIn(resaved).length === 3, imageKeysIn(resaved).join(", "));

  check("the share link is absolute",
    publicCopy.shareUrl === "https://ttdg.org/newsletters/an-issue");
  check("a blank summary is not back-filled",
    publicCopy.summary === "");
  check("but the excerpt falls back to the opening line",
    publicCopy.excerpt.startsWith("Opening line"));
}

console.log("\nDerived values");
{
  check("every image key is found, galleries included",
    imageKeysIn(stored).length === 3, imageKeysIn(stored).join(", "));
  check("list items count toward the text",
    plainText(stored).includes("First") && plainText(stored).includes("Second"));
  check("captions count toward the text",
    plainText(stored).includes("A caption"));
  check("reading time is at least a minute", readingMinutes(stored) >= 1);
  check("slugs are url safe",
    slugify("Rush week, start to finish!") === "rush-week-start-to-finish");
  check("a title with no letters still yields a slug",
    slugify("!!!") === "newsletter");
}

  console.log(
    failures === 0
      ? "\nAll newsletter checks passed.\n"
      : `\n${failures} check(s) failed.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import type { SerializedBlock } from "@/lib/newsletterTypes";

/// Which ground the article is printed on.
///
/// "paper" is the public site's cream sheet, whose ink is a fixed dark brown
/// because that page is one appearance only. "app" is the members-only area,
/// which has a real light/dark theme, so it has to use semantic tokens or
/// every article turns into black text on a black card at night.
///
/// One renderer with two palettes rather than two renderers: the block types
/// and their markup are the thing that must not drift, and the colours are the
/// only part that actually differs.
export type ArticleTone = "paper" | "app";

interface ToneClasses {
  heading: string;
  subheading: string;
  body: string;
  quoteRule: string;
  quoteText: string;
  attribution: string;
  caption: string;
  credit: string;
  imageBg: string;
  divider: string;
  callout: Record<string, string>;
}

const TONES: Record<ArticleTone, ToneClasses> = {
  paper: {
    heading: "text-[#1b0f0f]",
    subheading: "text-[#7a0104]",
    body: "text-[#1b0f0f]/85",
    quoteRule: "border-[#7a0104]",
    quoteText: "text-[#1b0f0f]",
    attribution: "text-[#7a0104]",
    caption: "text-[#1b0f0f]/55",
    credit: "text-[#1b0f0f]/40",
    imageBg: "bg-[#1b0f0f]/5",
    divider: "border-[#1b0f0f]/20",
    callout: {
      note: "border-[#1b0f0f]/15 bg-[#1b0f0f]/[0.04] text-[#1b0f0f]/85",
      highlight: "border-[#7a0104]/30 bg-[#7a0104]/[0.06] text-[#1b0f0f]/85",
      warning: "border-[#b3202a]/40 bg-[#b3202a]/[0.07] text-[#1b0f0f]/85",
    },
  },
  app: {
    heading: "text-foreground",
    subheading: "text-primary",
    body: "text-foreground/85",
    quoteRule: "border-primary",
    quoteText: "text-foreground",
    attribution: "text-primary",
    caption: "text-muted-foreground",
    credit: "text-muted-foreground/70",
    imageBg: "bg-muted",
    divider: "border-border",
    callout: {
      note: "border-border bg-muted/50 text-foreground/85",
      highlight: "border-primary/30 bg-primary/[0.07] text-foreground/85",
      warning: "border-destructive/40 bg-destructive/[0.07] text-foreground/85",
    },
  },
};

/**
 * One article's body.
 *
 * Server-safe on purpose: this is the content search engines and link
 * unfurlers read, so it renders on the server with no hydration behind it.
 *
 * The measure comes from the column this sits in rather than from a cap here.
 * An inner `max-w` fought the page's own width and left the text floating in a
 * sheet wider than itself.
 */

/// The reading measure.
///
/// Text stays at roughly 75 characters however wide the sheet gets. A column
/// that grows with the window is the single most common way a long article
/// becomes unreadable, so the extra room on a big screen goes to the pictures
/// instead of to the line length.
const TEXT = "mx-auto w-full max-w-[38rem]";

/// How far a picture is allowed to break out of that measure.
///
/// This is what the Standard / Wide / Full control in the builder actually
/// does, and on a wide screen the three are plainly different: standard lines
/// up with the text, wide overhangs it, and full runs the width of the sheet
/// and bleeds through its padding.
const IMAGE_LAYOUT_CLASS: Record<string, string> = {
  standard: "mx-auto w-full max-w-[38rem]",
  wide: "mx-auto w-full max-w-[48rem]",
  full: "-mx-6 w-[calc(100%+3rem)] sm:-mx-10 sm:w-[calc(100%+5rem)] lg:-mx-14 lg:w-[calc(100%+7rem)]",
};

function Caption({
  text,
  credit,
  tone,
}: {
  text?: string;
  credit?: string;
  tone: ToneClasses;
}) {
  if (!text && !credit) return null;
  return (
    <figcaption className={`mt-2.5 text-sm leading-snug ${tone.caption}`}>
      {text}
      {credit ? (
        // Set apart from the caption: a credit is attribution, not description,
        // and running them together reads as one sentence that stops making
        // sense halfway through.
        <span className={`ml-2 text-[11px] uppercase tracking-wide ${tone.credit}`}>
          {credit}
        </span>
      ) : null}
    </figcaption>
  );
}

export default function ArticleBlocks({
  blocks,
  tone: toneName = "paper",
}: {
  blocks: SerializedBlock[];
  tone?: ArticleTone;
}) {
  const tone = TONES[toneName];
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block) => {
        switch (block.type) {
          case "heading":
            return (
              <h2
                key={block.id}
                className={`${TEXT} mt-5 text-xl font-bold leading-snug tracking-tight sm:text-2xl ${tone.heading}`}
              >
                {block.text}
              </h2>
            );

          case "subheading":
            return (
              <h3
                key={block.id}
                className={`${TEXT} mt-3 text-base font-bold uppercase tracking-[0.08em] ${tone.subheading}`}
              >
                {block.text}
              </h3>
            );

          case "paragraph":
            return (
              <p
                key={block.id}
                className={`${TEXT} whitespace-pre-line text-[1.0625rem] leading-[1.7] ${tone.body}`}
              >
                {block.text}
              </p>
            );

          case "list": {
            const items = block.items ?? [];
            const className =
              `${TEXT} flex flex-col gap-2 pl-5 text-[1.0625rem] leading-[1.7] ${tone.body}`;
            return block.ordered ? (
              <ol key={block.id} className={`list-decimal ${className}`}>
                {items.map((item, index) => (
                  <li key={index} className="pl-1">
                    {item}
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={block.id} className={`list-disc ${className}`}>
                {items.map((item, index) => (
                  <li key={index} className="pl-1">
                    {item}
                  </li>
                ))}
              </ul>
            );
          }

          case "quote":
            return (
              <figure
                key={block.id}
                className={`${TEXT} my-2 border-l-[3px] pl-5 ${tone.quoteRule}`}
              >
                <blockquote className={`text-xl italic leading-relaxed ${tone.quoteText}`}>
                  {block.text}
                </blockquote>
                {block.attribution ? (
                  <figcaption className={`mt-2 text-xs font-semibold uppercase tracking-[0.16em] ${tone.attribution}`}>
                    {block.attribution}
                  </figcaption>
                ) : null}
              </figure>
            );

          case "callout":
            return (
              <aside
                key={block.id}
                className={`${TEXT} my-2 whitespace-pre-line rounded-xl border px-5 py-4 text-[1rem] leading-[1.65] ${
                  tone.callout[block.variant ?? "note"] ?? tone.callout.note
                }`}
              >
                {block.text}
              </aside>
            );

          case "image": {
            if (!block.imageUrl) return null;
            const layout = IMAGE_LAYOUT_CLASS[block.layout ?? "standard"] ?? "";
            return (
              <figure key={block.id} className={`my-3 ${layout}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={block.imageUrl}
                  alt={block.alt || block.caption || ""}
                  /* Reserving the box stops the article reflowing under
                     somebody who is already reading it. Both are 0 when the
                     upload predates sharp, and the browser falls back to its
                     own layout. */
                  width={block.width || undefined}
                  height={block.height || undefined}
                  loading="lazy"
                  decoding="async"
                  className={`h-auto w-full object-cover ${tone.imageBg} ${
                    block.layout === "full" ? "rounded-none sm:rounded-xl" : "rounded-xl"
                  }`}
                />
                <div className={block.layout === "full" ? "px-6 sm:px-10 lg:px-14" : ""}>
                  <Caption text={block.caption} credit={block.credit} tone={tone} />
                </div>
              </figure>
            );
          }

          case "gallery": {
            const images = (block.images ?? []).filter((image) => image.imageUrl);
            if (!images.length) return null;
            return (
              <figure key={block.id} className="mx-auto my-3 w-full max-w-[48rem]">
                {/* Two across from the small breakpoint up, and a single
                    picture simply fills the row rather than sitting in a
                    half-width box next to nothing. */}
                <div
                  className={`grid gap-2 ${
                    images.length === 1 ? "grid-cols-1" : "grid-cols-2"
                  }`}
                >
                  {images.map((image, index) => (
                    <div key={index} className="overflow-hidden rounded-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.imageUrl}
                        alt={image.alt || image.caption || ""}
                        loading="lazy"
                        decoding="async"
                        className={`aspect-[4/3] h-full w-full object-cover ${tone.imageBg}`}
                      />
                    </div>
                  ))}
                </div>
                <Caption text={block.caption} tone={tone} />
              </figure>
            );
          }

          case "divider":
            return (
              <hr
                key={block.id}
                className={`mx-auto my-5 w-16 border-0 border-t ${tone.divider}`}
              />
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

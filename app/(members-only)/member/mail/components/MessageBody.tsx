"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ellipsis } from "lucide-react";

/// Where each mail client puts the history under a reply. Gmail's own markup,
/// Apple Mail's cite, Yahoo's and Outlook on the web's containers.
const QUOTE_SELECTOR = [
  ".gmail_quote_container",
  "div.gmail_quote",
  "blockquote.gmail_quote",
  'blockquote[type="cite"]',
  ".yahoo_quoted",
  "#divRplyFwdMsg",
].join(",");

/// A forward is the message itself, not history, so Gmail leaves it open.
function isForward(element: Element): boolean {
  return /^\s*-+\s*Forwarded message/i.test(element.textContent || "");
}

/// Folds the quoted history out of a plain-text message: the "On … wrote:"
/// line and the ">" lines that follow it, when they close the message.
function splitTextQuote(text: string): { body: string; quote: string } {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const rest = lines.slice(i + 1).filter((l) => l.trim());
    if (/^\s*On .+wrote:\s*$/.test(lines[i]) && rest.length && rest.every((l) => l.startsWith(">"))) {
      start = i;
      break;
    }
  }
  if (start <= 0 || !lines.slice(0, start).join("").trim()) return { body: text, quote: "" };
  return { body: lines.slice(0, start).join("\n").trimEnd(), quote: lines.slice(start).join("\n") };
}

function isUnreadableOnDark(value: string): boolean {
  const color = value.toLowerCase().replace(/\s+/g, "");
  if (color === "black") return true;

  let red: number;
  let green: number;
  let blue: number;
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
    red = Number.parseInt(expanded.slice(0, 2), 16);
    green = Number.parseInt(expanded.slice(2, 4), 16);
    blue = Number.parseInt(expanded.slice(4, 6), 16);
  } else {
    const rgb = color.match(/^rgba?\((\d+),(\d+),(\d+)(?:,[\d.]+)?\)$/);
    if (!rgb) return false;
    red = Number(rgb[1]);
    green = Number(rgb[2]);
    blue = Number(rgb[3]);
  }

  // Preserve recognizable authored colors, but lift neutral/dark text that
  // would disappear against the viewer's dark surface.
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance < 72 && chroma < 45;
}

/// A received message's HTML, in a frame of its own.
///
/// The HTML was sanitized on the server; the frame is the second wall. It is
/// sandboxed with scripts off, and a Content-Security-Policy inside it keeps
/// remote images (the usual read-receipt trackers) from loading until the
/// member asks for them.
export default function MessageBody({
  html,
  text,
  inlineImageUrls,
  foldQuotes = true,
  trustImages = false,
}: {
  html: string;
  text: string;
  inlineImageUrls?: string[];
  /// Hide the quoted history behind "..." the way Gmail does.
  foldQuotes?: boolean;
  /// Load remote images straight away, for mail from inside the chapter.
  trustImages?: boolean;
}) {
  const [showImages, setShowImages] = useState(trustImages);
  const [showQuoted, setShowQuoted] = useState(false);
  const [dark, setDark] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const { doc, blocked, hasQuote } = useMemo(() => {
    if (!html) return { doc: "", blocked: false, hasQuote: false };
    const allowed = new Set(inlineImageUrls ?? []);
    const parsed = new DOMParser().parseFromString(html, "text/html");
    let quoteFound = false;
    if (foldQuotes) {
      const outermost = Array.from(parsed.body.querySelectorAll(QUOTE_SELECTOR)).filter(
        (element) => !element.parentElement?.closest(QUOTE_SELECTOR) && !isForward(element)
      );
      if (outermost.length) {
        // Only fold when something is left to read. A message that is all
        // quote (a bare forward from some clients) stays as it is.
        const probe = parsed.body.cloneNode(true) as HTMLElement;
        probe.querySelectorAll(QUOTE_SELECTOR).forEach((element) => {
          if (!element.parentElement?.closest(QUOTE_SELECTOR) && !isForward(element)) element.remove();
        });
        const remains = (probe.textContent || "").trim() || probe.querySelector("img");
        if (remains) {
          quoteFound = true;
          if (!showQuoted) outermost.forEach((element) => element.remove());
        }
      }
    }
    if (dark) {
      const compact = (value: string) => value.toLowerCase().replace(/\s+/g, "");
      const nearWhite = new Set(["white", "#fff", "#ffffff", "rgb(255,255,255)", "rgba(255,255,255,1)", "#fafafa", "#f9fafb"]);
      parsed.querySelectorAll<HTMLElement>("*").forEach((element) => {
        if (element.style.color && isUnreadableOnDark(element.style.color)) {
          element.style.setProperty("color", "#f4f4f5", "important");
        }
        if (element.style.backgroundColor && nearWhite.has(compact(element.style.backgroundColor))) element.style.backgroundColor = "transparent";
        const color = element.getAttribute("color");
        if (color && isUnreadableOnDark(color)) {
          element.setAttribute("color", "#f4f4f5");
          element.style.setProperty("color", "#f4f4f5", "important");
        }
        const background = element.getAttribute("bgcolor");
        if (background && nearWhite.has(compact(background))) element.removeAttribute("bgcolor");
      });
    }
    let blockedCount = 0;
    parsed.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (/^https?:/i.test(src) && !allowed.has(src)) {
        blockedCount += 1;
        if (!showImages) {
          img.setAttribute("data-blocked-src", src);
          img.removeAttribute("src");
        }
      }
    });
    const inlineOrigins = Array.from(allowed)
      .map((u) => {
        try {
          return new URL(u).origin;
        } catch {
          return "";
        }
      })
      .filter(Boolean)
      .join(" ");
    const imgSrc = showImages ? "* data:" : `data: ${inlineOrigins}`;
    const csp = `default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline' *; font-src * data:;`;
    const surface = dark ? "#18181b" : "#fafafa";
    const foreground = dark ? "#f4f4f5" : "#18181b";
    const link = dark ? "#60a5fa" : "#2563eb";
    const quoteBorder = dark ? "#52525b" : "#d4d4d8";
    const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>html{margin:0;background:${surface}}body{box-sizing:border-box;margin:0;min-height:100%;padding:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:${foreground};background:${surface};word-wrap:break-word}a{color:${link}!important;text-decoration:underline!important}img{max-width:100%;height:auto}pre{white-space:pre-wrap}blockquote{margin:.75em 0;border-left:3px solid ${quoteBorder};padding-left:1em}</style>`;
    return {
      doc: `<!doctype html><html><head>${head}</head><body>${parsed.body.innerHTML}</body></html>`,
      blocked: blockedCount > 0 && !showImages,
      hasQuote: quoteFound,
    };
  }, [dark, html, inlineImageUrls, showImages, foldQuotes, showQuoted]);

  const textParts = useMemo(
    () => (foldQuotes ? splitTextQuote(text || "") : { body: text || "", quote: "" }),
    [text, foldQuotes]
  );

  const quoteToggle = (
    <button
      type="button"
      onClick={() => setShowQuoted((v) => !v)}
      className="flex h-5 items-center rounded-sm bg-muted px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-expanded={showQuoted}
      aria-label={showQuoted ? "Hide quoted text" : "Show quoted text"}
    >
      <Ellipsis className="size-4" />
    </button>
  );

  // Same-origin (scripts still off) only so the frame can be sized to its
  // content instead of scrolling inside the page.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !doc) return;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const body = frame.contentDocument?.body;
      if (body) setHeight(Math.max(60, body.scrollHeight + 8));
    };
    const onLoad = () => {
      measure();
      const body = frame.contentDocument?.body;
      if (body && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(measure);
        observer.observe(body);
      }
    };
    frame.addEventListener("load", onLoad);
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, [doc]);

  if (!html) {
    return (
      <div className="whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-muted/20 p-4 text-sm leading-relaxed text-foreground shadow-sm">
        {textParts.body || "(This message has no content.)"}
        {textParts.quote && (
          <div className="mt-3 space-y-2">
            {quoteToggle}
            {showQuoted && <div className="text-muted-foreground">{textParts.quote}</div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {blocked && (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span>Images from outside senders are hidden.</span>
          <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => setShowImages(true)}>
            Show images
          </button>
        </div>
      )}
      <iframe
        ref={frameRef}
        title="Message"
        srcDoc={doc}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="w-full rounded-lg border border-border/70 bg-card shadow-sm"
        style={{ height }}
      />
      {hasQuote && quoteToggle}
    </div>
  );
}

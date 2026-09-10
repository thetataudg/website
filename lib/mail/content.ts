// lib/mail/content.ts
// Turning mail bodies into something safe to store and show.
import sanitizeHtml from "sanitize-html";

/// Inbound HTML is written by strangers. It is sanitized here, on the way into
/// the database, and then rendered again inside a sandboxed iframe with
/// scripts off. Two walls, because either alone has been broken before.
export function sanitizeEmailHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img", "h1", "h2", "center", "font", "span", "u", "s", "del", "ins",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "col", "style",
    ]),
    allowedAttributes: {
      "*": ["style", "align", "valign", "width", "height", "bgcolor", "color", "dir", "class", "title"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "style"],
      td: ["colspan", "rowspan", "style", "align", "valign", "width", "bgcolor"],
      th: ["colspan", "rowspan", "style", "align", "valign", "width", "bgcolor"],
      table: ["cellpadding", "cellspacing", "border", "width", "style", "align", "bgcolor"],
      font: ["face", "size", "color"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
    allowVulnerableTags: true, // <style>: needed for most real-world mail layout, safe inside the sandbox
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
    },
  });
}

/// HTML authored in our composer. This is intentionally narrower than the
/// inbound sanitizer: it keeps ordinary email formatting and web-safe fonts,
/// while rejecting executable or layout-breaking markup before draft storage.
export function sanitizeComposedHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: [
      "a", "b", "blockquote", "br", "code", "del", "div", "em", "font",
      "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol", "p",
      "pre", "s", "span", "strike", "strong", "table", "tbody", "td", "th",
      "thead", "tr", "u", "ul",
    ],
    allowedAttributes: {
      "*": ["style", "align"],
      a: ["href", "target", "rel", "title"],
      font: ["face", "size", "color"],
      img: ["src", "alt", "title", "width", "height"],
      td: ["colspan", "rowspan", "align"],
      th: ["colspan", "rowspan", "align"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedStyles: {
      "*": {
        color: [/^(?:#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]+)$/i],
        "background-color": [/^(?:#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]+)$/i],
        "font-family": [/^[\w\s"',.-]+$/],
        "font-size": [/^(?:\d+(?:\.\d+)?(?:px|pt|em|rem|%)|x{0,2}-?small|medium|x{0,2}-?large)$/i],
        "font-style": [/^(?:normal|italic|oblique)$/i],
        "font-weight": [/^(?:normal|bold|bolder|lighter|[1-9]00)$/i],
        "text-align": [/^(?:left|right|center|justify|start|end)$/i],
        "text-decoration": [/^[a-z\s-]+$/i],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer nofollow",
        style: "color:#2563eb;text-decoration:underline",
      }),
    },
  });
}

export function htmlToText(html: string): string {
  return sanitizeHtml(html || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function snippetOf(text: string, html?: string): string {
  const source = text?.trim() ? text : htmlToText(html || "");
  return source.replace(/\s+/g, " ").trim().slice(0, 200);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/// What a member typed, as the HTML part of their email. Links are made
/// clickable and quoted lines (">") become a blockquote, which is all a plain
/// composer needs to produce mail that looks right in Gmail.
export function textToHtml(text: string): string {
  const lines = escapeHtml(text || "").split(/\r?\n/);
  const out: string[] = [];
  let quote: string[] = [];
  const flush = () => {
    if (quote.length) {
      out.push(
        `<blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex;color:#555">${quote.join("<br>")}</blockquote>`
      );
      quote = [];
    }
  };
  for (const line of lines) {
    if (line.startsWith("&gt;")) {
      quote.push(line.replace(/^&gt; ?/, ""));
    } else {
      flush();
      out.push(line);
    }
  }
  flush();
  const body = out
    .join("<br>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5">${body}</div>`;
}

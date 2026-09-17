// lib/mail/content.ts
// Turning mail bodies into something safe to store and show.
import sanitizeHtml from "sanitize-html";
import { DateTime } from "luxon";
import { ARIZONA_ZONE } from "@/lib/recurrence";

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
      // Apple Mail marks quoted text with type="cite"; the viewer folds it.
      blockquote: ["type", "style", "class"],
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
      // Marks the signature block, so switching signatures replaces it rather
      // than stacking a second one underneath.
      div: ["style", "align", "data-mail-signature"],
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
        "max-width": [/^(?:100%|\d+(?:\.\d+)?px)$/i],
        height: [/^(?:auto|\d+(?:\.\d+)?px)$/i],
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

/// Signature images are stored with app-relative URLs so they preview on every
/// environment. Delivered email needs a full URL because it has no base URL.
export function absolutizeSignatureImageUrls(html: string, origin: string): string {
  const base = origin.replace(/\/$/, "");
  return html.replace(
    /(<img\b[^>]*\bsrc=["'])\/api\/mail\/signature-images\//gi,
    `$1${base}/api/mail/signature-images/`
  );
}

export function htmlToText(html: string): string {
  // Keep structural line breaks before removing markup. Stripping every tag in
  // one pass joins paragraphs and quote lines together, which turns a reopened
  // reply into runs such as `> Hello, >> next line`.
  const structured = sanitizeHtml(html || "", {
    allowedTags: ["br", "blockquote", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ol", "p", "pre", "tr", "ul"],
    allowedAttributes: {},
  })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/(?:blockquote|div|h[1-6]|li|ol|p|pre|tr|ul)>/gi, "\n");
  return sanitizeHtml(structured, { allowedTags: [], allowedAttributes: {} })
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

/// The part of a plain-text body the sender wrote, without the history they
/// replied to: everything from the "On … wrote:" line down, and any ">" lines.
/// The attribution line is often wrapped across two lines by the sender's
/// client ("On Wed, Sep 16 … <a@b.org>" then "wrote:"), so both are matched.
export function withoutQuotedText(text: string): string {
  const lines = String(text || "").split(/\r?\n/);
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    const joined = `${line} ${(lines[i + 1] || "").trim()}`;
    if (/^On\b.*\bwrote:$/i.test(line) || (/^On\b/i.test(line) && /\bwrote:$/i.test(joined))) break;
    if (/^-{2,}\s*(Original|Forwarded) Message\s*-{2,}$/i.test(line)) break;
    if (/^From:\s.+/i.test(line) && /^(Sent|Date):\s/i.test((lines[i + 1] || "").trim())) break;
    if (line.startsWith(">")) continue;
    kept.push(lines[i]);
  }
  return kept.join("\n").trim();
}

/// The same for HTML: the quote containers Gmail, Apple Mail, Outlook and
/// Yahoo wrap the history in are dropped before the text is taken.
function htmlWithoutQuotes(html: string): string {
  return sanitizeHtml(html || "", {
    // Enough to find the quote containers by their class, id or type; the
    // result only ever becomes plain text.
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["span", "font", "center"]),
    allowedAttributes: { "*": ["class", "id", "type"] },
    exclusiveFilter: (frame) => {
      const cls = String(frame.attribs?.class || "");
      return (
        /\bgmail_quote\b|\bgmail_quote_container\b|\byahoo_quoted\b/.test(cls) ||
        (frame.tag === "blockquote" && (frame.attribs?.type === "cite" || /gmail_quote/.test(cls))) ||
        frame.attribs?.id === "divRplyFwdMsg" ||
        frame.attribs?.id === "appendonsend"
      );
    },
  });
}

/// A one-line preview for the message list and push notifications: what was
/// written in this message, not the conversation it quotes. Falls back to the
/// full text only if stripping the quote would leave nothing.
export function snippetOf(text: string, html?: string): string {
  const fromText = text?.trim() ? withoutQuotedText(text) : "";
  const fromHtml = !fromText && html ? withoutQuotedText(htmlToText(htmlWithoutQuotes(html))) : "";
  const source = fromText || fromHtml || (text?.trim() ? text : htmlToText(html || ""));
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
      // Multiple prefixes are quote depth in the plain-text MIME part, not
      // characters that should be printed inside the visual quote.
      quote.push(line.replace(/^(?:&gt;)+ ?/, ""));
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

/// "On Tue, Sep 15, 2026 at 8:02 PM Vinny Panchal <v@x.org>", the attribution
/// line every mail client puts above a quote.
function attribution(parent: any): string {
  const date = parent?.date ? new Date(parent.date) : new Date();
  const when = DateTime.fromJSDate(date)
    .setZone(ARIZONA_ZONE)
    .toFormat("ccc, LLL d, yyyy 'at' h:mm a");
  const who = parent?.fromName ? `${parent.fromName} <${parent.from}>` : String(parent?.from || "");
  return `On ${when} ${who}`;
}

function parentBodyHtml(parent: any): string {
  const html = String(parent?.html || "");
  const text = String(parent?.text || "");
  // Repair messages produced by the legacy draft loop. Their HTML contains
  // literal doubled quote prefixes instead of semantic quote markup.
  if (html && !/<blockquote\b/i.test(html) && /(?:&gt;\s*){2,}/i.test(html)) {
    return textToHtml(text || htmlToText(html));
  }
  return html || textToHtml(text);
}

/// The quote under a reply, in the same markup Gmail writes. Other clients
/// (Gmail included) recognise `gmail_quote` and fold it behind "..." instead
/// of printing the whole history into the conversation, and the original's
/// HTML comes through intact, pictures and all.
export function replyQuote(parent: any): { html: string; text: string } {
  const head = `${attribution(parent)} wrote:`;
  const html =
    `<br><div class="gmail_quote gmail_quote_container">` +
    `<div dir="ltr" class="gmail_attr">${escapeHtml(head)}<br></div>` +
    `<blockquote type="cite" class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">` +
    `${parentBodyHtml(parent)}</blockquote></div>`;
  const quoted = String(parent?.text || htmlToText(parent?.html || ""))
    .trim()
    .split(/\r?\n/)
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
  return { html, text: `\n\n${head}\n\n${quoted}` };
}

/// The block under a forward, Gmail's shape again.
export function forwardBlock(parent: any): { html: string; text: string } {
  const date = parent?.date ? new Date(parent.date) : new Date();
  const when = DateTime.fromJSDate(date).setZone(ARIZONA_ZONE).toFormat("ccc, LLL d, yyyy 'at' h:mm a");
  const from = parent?.fromName ? `${parent.fromName} <${parent.from}>` : String(parent?.from || "");
  const rows: Array<[string, string]> = [
    ["From", from],
    ["Date", when],
    ["Subject", String(parent?.subject || "")],
    ["To", (parent?.to ?? []).join(", ")],
  ];
  if (parent?.cc?.length) rows.push(["Cc", parent.cc.join(", ")]);
  const html =
    `<br><div class="gmail_quote gmail_quote_container">` +
    `<div dir="ltr" class="gmail_attr">---------- Forwarded message ---------<br>` +
    rows.map(([k, v]) => `${k}: ${escapeHtml(v)}<br>`).join("") +
    `</div><br><br>${parentBodyHtml(parent)}</div>`;
  const text =
    `\n\n---------- Forwarded message ---------\n` +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\n${String(parent?.text || htmlToText(parent?.html || "")).trim()}`;
  return { html, text };
}

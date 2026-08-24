// lib/notify/emailTemplate.ts
// The one email layout the chapter sends. Every message renders through here.
//
// Email is not the web. Gmail strips <style> blocks in some contexts, Outlook
// renders through Word's HTML engine and ignores flexbox, grid, float and
// most of `background`, and roughly half of recipients read it on a phone with
// images off by default. So: tables for layout, every style inline, a fixed
// 600px shell, no external assets of any kind — the wordmark is type on a
// coloured band rather than an image, which means it survives image blocking
// instead of leaving a grey box where the chapter's name should be.
//
// Colours are the public site's palette (`--tt-*`), not the iOS app's. Email is
// outward-facing the way the website is, and the warmer red reads better
// against a mail client's white chrome than the app's near-black crimson.

export const BRAND = {
  red: "#8b1b23",
  redDeep: "#5a0a10",
  gold: "#e1b21e",
  // Plain white behind everything. The one tinted surface is the amount panel,
  // which is the only thing that should pull the eye on open.
  paper: "#ffffff",
  card: "#ffffff",
  wash: "#f7f3ee",
  ink: "#12110f",
  inkSoft: "#4a443d",
  muted: "#7a716a",
  line: "#e4dcd1",
  positive: "#1d8a43",
  negative: "#c7302b",
} as const;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export interface EmailMetaRow {
  label: string;
  value: string;
  /// Draws the value in the positive or negative brand colour. Used sparingly —
  /// a whole table of coloured text stops meaning anything.
  tone?: "positive" | "negative";
}

export interface EmailContent {
  /// Sits under the title, big. The one number the reader came for.
  heroAmount?: string;
  heroLabel?: string;
  title: string;
  /// One or two short paragraphs. Kept as an array so the template controls
  /// spacing rather than callers embedding <br> and hoping.
  paragraphs: string[];
  meta?: EmailMetaRow[];
  ctaLabel?: string;
  ctaHref?: string;
  /// The quiet line under the button — context, caveats, what happens next.
  footnote?: string;
  /// Where a reply actually lands. Not printed any more, but kept so a caller
  /// can render it when the context warrants naming a person.
  replyTo?: string;
  /// Inbox preview text. Without it clients scrape the first visible words,
  /// which is the wordmark, so every message previews identically as
  /// "THETA TAU Delta Gamma".
  preheader?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    char === "&" ? "&amp;"
      : char === "<" ? "&lt;"
      : char === ">" ? "&gt;"
      : char === '"' ? "&quot;"
      : "&#39;"
  );
}

/// A button that survives Outlook.
///
/// Word's rendering engine drops padding on anchors, so the desktop Outlooks
/// would show a bare underlined link where the button should be. The VML block
/// draws a real rectangle for them and is hidden from every other client by the
/// conditional comment.
function button(label: string, href: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 0">
  <tr><td align="center" bgcolor="${BRAND.red}" style="border-radius:6px">
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
      href="${safeHref}" style="height:44px;v-text-anchor:middle;width:230px" arcsize="14%"
      stroke="f" fillcolor="${BRAND.red}">
      <w:anchorlock/>
      <center style="color:#ffffff;font-family:${FONT};font-size:15px;font-weight:bold">${safeLabel}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <a href="${safeHref}"
       style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;background:${BRAND.red}">${safeLabel}</a>
    <!--<![endif]-->
  </td></tr>
</table>`;
}

/// The full document.
export function renderEmailHtml(content: EmailContent): string {
  const preheader = content.preheader ?? content.paragraphs[0] ?? "";

  const hero = content.heroAmount
    ? `
<tr><td style="padding:0 40px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="background:${BRAND.wash};border:1px solid ${BRAND.line};border-radius:8px">
    <tr><td style="padding:22px 26px;text-align:center">
      ${content.heroLabel ? `<div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${BRAND.muted};padding-bottom:6px">${escapeHtml(content.heroLabel)}</div>` : ""}
      <div style="font-family:${FONT};font-size:38px;line-height:1.1;font-weight:700;color:${BRAND.ink}">${escapeHtml(content.heroAmount)}</div>
    </td></tr>
  </table>
</td></tr>`
    : "";

  const meta = content.meta?.length
    ? `
<tr><td style="padding:26px 40px 0">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="border-top:1px solid ${BRAND.line}">
    ${content.meta
      .map(
        (row) => `
    <tr>
      <td style="padding:11px 0;font-family:${FONT};font-size:14px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.line}">${escapeHtml(row.label)}</td>
      <td align="right" style="padding:11px 0;font-family:${FONT};font-size:14px;font-weight:600;color:${
        row.tone === "positive" ? BRAND.positive
          : row.tone === "negative" ? BRAND.negative
          : BRAND.ink
      };border-bottom:1px solid ${BRAND.line}">${escapeHtml(row.value)}</td>
    </tr>`
      )
      .join("")}
  </table>
</td></tr>`
    : "";

  const paragraphs = content.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 14px;font-family:${FONT};font-size:15.5px;line-height:1.65;color:${BRAND.inkSoft};text-align:center">${escapeHtml(text)}</p>`
    )
    .join("");

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<title>${escapeHtml(content.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.paper};-webkit-font-smoothing:antialiased">

<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0">${escapeHtml(preheader)}</div>
<!-- Padding characters stop clients pulling the body text into the preview
     after the preheader ends. -->
<div style="display:none;max-height:0;overflow:hidden">${"&#847;&zwnj;&nbsp;".repeat(60)}</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.paper}">
<tr><td align="center" style="padding:28px 12px">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
         style="width:600px;max-width:100%;background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:10px;overflow:hidden">

    <tr><td style="background:${BRAND.redDeep};padding:20px 40px;text-align:center">
      <div style="font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:4px;color:#ffffff">THETA TAU</div>
      <div style="font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:2.2px;text-transform:uppercase;color:${BRAND.gold};padding-top:4px">Delta Gamma</div>
    </td></tr>
    <tr><td style="height:3px;background:${BRAND.gold};font-size:0;line-height:0">&nbsp;</td></tr>

    <tr><td align="center" style="padding:34px 40px 18px;text-align:center">
      <h1 style="margin:0;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.ink}">${escapeHtml(content.title)}</h1>
    </td></tr>

    ${hero}

    <tr><td align="center" style="padding:${content.heroAmount ? "22px" : "0"} 40px 0;text-align:center">
      ${paragraphs}
      ${content.ctaLabel && content.ctaHref ? button(content.ctaLabel, content.ctaHref) : ""}
    </td></tr>

    ${meta}

    ${content.footnote ? `
    <tr><td align="center" style="padding:24px 40px 0;text-align:center">
      <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};text-align:center">${escapeHtml(content.footnote)}</p>
    </td></tr>` : ""}

    <tr><td align="center" style="padding:30px 40px 34px;text-align:center">
      <div style="border-top:1px solid ${BRAND.line};padding-top:18px">
        <p style="margin:0 0 6px;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${BRAND.muted};text-align:center">
          Theta Tau &middot; Delta Gamma Chapter &middot; Arizona State University
        </p>
        <p style="margin:0;font-family:${FONT};font-size:12.5px;line-height:1.6;color:${BRAND.muted};text-align:center">
          This is an automated message.
        </p>
      </div>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

/// The plain-text alternative.
///
/// Not optional. A message with no text part is a well-known spam signal, and
/// it's the version that gets read by screen readers, smartwatches and anyone
/// whose client refuses HTML.
export function renderEmailText(content: EmailContent): string {
  const lines: string[] = ["THETA TAU / DELTA GAMMA", "", content.title.toUpperCase(), ""];
  if (content.heroAmount) {
    lines.push(
      content.heroLabel ? `${content.heroLabel}: ${content.heroAmount}` : content.heroAmount,
      ""
    );
  }
  lines.push(...content.paragraphs, "");
  if (content.meta?.length) {
    lines.push(...content.meta.map((row) => `${row.label}: ${row.value}`), "");
  }
  if (content.ctaLabel && content.ctaHref) {
    lines.push(`${content.ctaLabel}: ${content.ctaHref}`, "");
  }
  if (content.footnote) lines.push(content.footnote, "");
  lines.push(
    "---",
    "Theta Tau, Delta Gamma Chapter, Arizona State University",
    "This is an automated message."
  );
  return lines.join("\n");
}

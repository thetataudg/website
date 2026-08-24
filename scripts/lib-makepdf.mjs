// Minimal text-only PDF writer.
//
// Enough of the format to lay out headed, wrapped paragraphs in Helvetica over
// as many pages as the content needs. Written by hand because the alternative
// was adding a PDF dependency to the website in order to produce four files of
// sample data that will be deleted again.
import fs from "node:fs";

const PAGE_W = 612, PAGE_H = 792;
const MARGIN = 64;
const WIDTH = PAGE_W - MARGIN * 2;

/// Helvetica advance widths, in 1/1000 em, for the printable ASCII range.
/// Close enough to wrap text correctly without embedding real font metrics.
const W = (ch) => {
  const c = ch.charCodeAt(0);
  if (ch === " ") return 278;
  if ("ijltI.,:;'|!".includes(ch)) return 240;
  if ("fr()[]-/\\".includes(ch)) return 333;
  if ("MW@".includes(ch)) return 889;
  if ("mw".includes(ch)) return 833;
  if (c >= 65 && c <= 90) return 667;   // upper case
  if (c >= 48 && c <= 57) return 556;   // digits
  return 556;                            // lower case and the rest
};

const textWidth = (s, size) =>
  [...s].reduce((sum, ch) => sum + W(ch), 0) * size / 1000;

function wrap(text, size, maxWidth) {
  const out = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/// blocks: [{ style: "title"|"h2"|"body"|"gap", text }]
export function buildPDF(blocks) {
  const STYLE = {
    title: { font: "F2", size: 17, lead: 24, before: 0,  after: 10 },
    h2:    { font: "F2", size: 11, lead: 16, before: 14, after: 4 },
    meta:  { font: "F1", size: 9.5, lead: 14, before: 0,  after: 2 },
    body:  { font: "F1", size: 10.5, lead: 15, before: 0, after: 7 },
  };

  const pages = [];
  let ops = [];
  let y = PAGE_H - MARGIN;

  const newPage = () => { pages.push(ops.join("\n")); ops = []; y = PAGE_H - MARGIN; };

  for (const block of blocks) {
    const style = STYLE[block.style] ?? STYLE.body;
    y -= style.before;
    for (const line of wrap(block.text ?? "", style.size, WIDTH)) {
      if (y < MARGIN + style.lead) newPage();
      if (line) {
        ops.push(
          `BT /${style.font} ${style.size} Tf 1 0 0 1 ${MARGIN} ${y.toFixed(1)} Tm (${esc(line)}) Tj ET`
        );
      }
      y -= style.lead;
    }
    y -= style.after;
  }
  pages.push(ops.join("\n"));

  // ---- assemble
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };

  const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  // Two objects already exist (the fonts), each page adds two more, and the
  // page tree is the one after those. The stream/page objects have to name the
  // tree before it is written, so this is predicted rather than read back — and
  // checked at the end, which is what caught it being one too high.
  const pagesId = objects.length + pages.length * 2 + 1;

  const pageIds = [];
  for (const content of pages) {
    const streamId = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    pageIds.push(add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
      `/Contents ${streamId} 0 R >>`
    ));
  }

  const realPagesId = add(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`
  );
  const catalogId = add(`<< /Type /Catalog /Pages ${realPagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  // The page objects reference `pagesId`, computed before assembly; make sure
  // it matched the real one rather than silently producing an unopenable file.
  if (pagesId !== realPagesId) {
    throw new Error(`page tree id mismatch: predicted ${pagesId}, got ${realPagesId}`);
  }

  return Buffer.from(pdf, "latin1");
}

if (process.argv[2] === "--selftest") {
  fs.writeFileSync("/tmp/selftest.pdf", buildPDF([
    { style: "title", text: "Delta Gamma Chapter" },
    { style: "body", text: "The quick brown fox jumps over the lazy dog. ".repeat(12) },
  ]));
  console.log("wrote /tmp/selftest.pdf");
}

// scripts/check-wallet-images.ts
// Proves the wallet pass can resize a member photo with no native image
// library present.
//
// The bug this guards against shipped a pass whose three thumbnails were
// byte-identical copies of the chapter crest, because the only code path left
// in production returned the source unchanged. Two properties catch that
// exact failure: the outputs must have the dimensions we asked for, and the
// three sizes must differ from each other.
//
//   npm run check:wallet-images
import fs from "fs";
import path from "path";

import jpeg from "jpeg-js";

import { resizeToPngSync } from "../lib/imageResize";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

/// PNG dimensions straight out of the IHDR, so the assertion does not depend
/// on the same decoder that produced the file.
function pngSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function pixelAt(buffer: Buffer, x: number, y: number) {
  const { PNG } = require("pngjs");
  const png = PNG.sync.read(buffer);
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

/// A 400x400 JPEG in four flat quadrants. Flat colour survives JPEG
/// compression well enough to assert on, and four different quadrants catch a
/// resize that flips, rotates or scrambles channels — all of which would still
/// produce a "valid" image.
function quadrantJpeg(): Buffer {
  const size = 400;
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const left = x < size / 2;
      const top = y < size / 2;
      const [r, g, b] = top
        ? left
          ? [220, 20, 20]
          : [20, 220, 20]
        : left
          ? [20, 20, 220]
          : [230, 230, 20];
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return Buffer.from(jpeg.encode({ data, width: size, height: size }, 92).data);
}

function near(actual: number, wanted: number, tolerance = 40) {
  return Math.abs(actual - wanted) <= tolerance;
}

console.log("— JPEG member photo, no sharp (the production failure) —");
const photo = quadrantJpeg();
const sizes = [90, 180, 270];
const outputs = sizes.map((size) =>
  resizeToPngSync(photo, { width: size, height: size, fit: "cover" })
);

outputs.forEach((out, index) => {
  const size = sizes[index];
  const dims = out ? pngSize(out) : null;
  check(
    `${size}px thumbnail is a PNG of exactly ${size}x${size}`,
    Boolean(dims && dims.width === size && dims.height === size),
    dims ? `${dims.width}x${dims.height}` : "not a PNG"
  );
});

// The property that would have caught the shipped bug: three identical files.
const hashes = outputs.map((out) => (out ? out.length : 0));
check(
  "the three sizes are genuinely different renders",
  new Set(hashes).size === 3,
  `byte lengths ${hashes.join(", ")}`
);

// Orientation and channel order, checked in the corners of the 180px render.
const mid = outputs[1];
if (mid) {
  const [tlR, tlG] = pixelAt(mid, 20, 20);
  const [, trG] = pixelAt(mid, 160, 20);
  const [, , blB] = pixelAt(mid, 20, 160);
  check("top-left quadrant is still red", near(tlR, 220) && near(tlG, 20), `r=${tlR} g=${tlG}`);
  check("top-right quadrant is still green", near(trG, 220), `g=${trG}`);
  check("bottom-left quadrant is still blue", near(blB, 220), `b=${blB}`);
}

console.log("\n— PNG crest with transparency —");
const crest = fs.readFileSync(path.join(process.cwd(), "public", "ot.png"));
const crestOut = resizeToPngSync(crest, { width: 90, height: 90, fit: "contain" });
const crestDims = crestOut ? pngSize(crestOut) : null;
check(
  "crest resizes to 90x90",
  Boolean(crestDims && crestDims.width === 90 && crestDims.height === 90),
  crestDims ? `${crestDims.width}x${crestDims.height}` : "not a PNG"
);
check(
  "crest is actually resized, not passed through",
  Boolean(crestOut && crestOut.length !== crest.length),
  `source ${crest.length} bytes, output ${crestOut?.length ?? 0} bytes`
);
if (crestOut) {
  const [, , , cornerAlpha] = pixelAt(crestOut, 1, 1);
  check("transparent corner stays transparent", cornerAlpha === 0, `alpha=${cornerAlpha}`);
}

console.log("\n— rejects what it cannot decode —");
check(
  "non-image bytes return null rather than throwing",
  resizeToPngSync(Buffer.from("not an image at all"), { width: 10, height: 10 }) === null
);

console.log(
  failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);

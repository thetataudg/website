// scripts/optimize-images.mjs
//
// Shrinks the photos in /public in place: at most 2560px on the long edge,
// re-encoded as progressive mozjpeg (JPEG) or max-compression PNG. Filenames
// never change, so no code has to.
//
// Why: the originals came straight off cameras and phones (6000x4000, up to
// 11 MB). next/image resizes them per request, but it still has to decode the
// full original on every cache miss, which is what made first loads slow, and
// they made the repo and every deploy ~280 MB heavier than it needed to be.
//
// Safe to re-run: a file is only rewritten when the result is at least 10%
// smaller, so already-optimized images are left alone.
//
//   npm run optimize:images            # rewrite in place
//   npm run optimize:images -- --dry   # report only
import fs from "fs";
import path from "path";
import sharp from "sharp";

const ROOT = "public";
const MAX_EDGE = 2560;
const DRY = process.argv.includes("--dry");

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)}MB`;

let before = 0;
let after = 0;
let rewritten = 0;

for (const file of walk(ROOT).filter((f) => /\.(jpe?g|png)$/i.test(f))) {
  const input = fs.readFileSync(file);
  before += input.length;
  try {
    // .rotate() applies the EXIF orientation before metadata is stripped, so
    // phone photos don't come out sideways.
    let pipeline = sharp(input).rotate().resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
    pipeline = /\.png$/i.test(file)
      ? pipeline.png({ compressionLevel: 9, effort: 10, palette: false })
      : pipeline.jpeg({ quality: 82, progressive: true, mozjpeg: true });
    const output = await pipeline.toBuffer();

    if (output.length < input.length * 0.9) {
      if (!DRY) fs.writeFileSync(file, output);
      after += output.length;
      rewritten += 1;
      console.log(`${mb(input.length).padStart(7)} -> ${mb(output.length).padStart(7)}  ${file}`);
    } else {
      after += input.length;
    }
  } catch (err) {
    after += input.length;
    console.warn(`skipped ${file}: ${err.message}`);
  }
}

console.log(
  `\n${DRY ? "Would rewrite" : "Rewrote"} ${rewritten} images: ${mb(before)} -> ${mb(after)}`
);

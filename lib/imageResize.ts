// lib/imageResize.ts
// Resizing images to PNG without a native binary.
//
// This exists because the Apple Wallet pass kept shipping the chapter crest
// instead of the member's face in production, and every previous fix aimed at
// the wrong layer. The evidence was in the pass file itself: in a production
// build, `thumbnail.png`, `thumbnail@2x.png` and `thumbnail@3x.png` were three
// byte-identical copies of `public/ot.png`, and `icon.png` through `icon@3x`
// were three copies of one file. Nothing had been resized at all, which is only
// reachable through the "give up and return the source" branch — so in that
// environment neither sharp nor `sips` was usable. A JPEG member photo hit the
// same branch, could not be returned as PNG, threw, and took the crest path.
//
// sharp is still the first choice and still declared; when it loads it is
// faster and sharper than this. But the pass must not depend on a native
// module resolving correctly inside a bundled serverless function on a
// different OS and architecture from the machine that traced it. Everything
// below is plain JavaScript: no `.node` binary, no platform package, no
// tracer to outwit.
//
// Note on orientation: sharp calls `.rotate()` to honour EXIF. This does not,
// because photos reach the bucket already re-encoded by a canvas (see
// `lib/prepareImageUpload.ts`), which drops the EXIF orientation tag and
// writes the pixels upright. A photo that arrived by some other route and
// carries an orientation tag will be resized as stored.
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

export type ResizeFit = "cover" | "contain";

export interface ResizeToPngOptions {
  width: number;
  height: number;
  fit?: ResizeFit;
}

interface RasterImage {
  width: number;
  height: number;
  /// RGBA, 8 bits per channel, row-major.
  data: Uint8Array | Buffer;
}

function isPng(source: Buffer): boolean {
  return (
    source.length > 8 &&
    source[0] === 0x89 &&
    source[1] === 0x50 &&
    source[2] === 0x4e &&
    source[3] === 0x47
  );
}

function isJpeg(source: Buffer): boolean {
  return source.length > 3 && source[0] === 0xff && source[1] === 0xd8;
}

/// Decoded frames, keyed on the exact buffer they came from.
///
/// A thumbnail set is three sizes of one photo, and the pass builder hands the
/// same Buffer to this module once per size. Without the cache a 2000px JPEG
/// gets fully decoded three times over — the most expensive part of the job,
/// repeated, on a serverless request that also has to sign a pass. Weak so an
/// entry disappears with the buffer it belongs to.
const decodeCache = new WeakMap<Buffer, RasterImage>();

function decode(source: Buffer): RasterImage | null {
  const cached = decodeCache.get(source);
  if (cached) return cached;

  const decoded = decodeUncached(source);
  if (decoded) decodeCache.set(source, decoded);
  return decoded;
}

function decodeUncached(source: Buffer): RasterImage | null {
  if (isPng(source)) {
    const png = PNG.sync.read(source);
    return { width: png.width, height: png.height, data: png.data };
  }
  if (isJpeg(source)) {
    // `formatAsRGBA` keeps the channel layout the same as the PNG path, so
    // everything downstream reads one pixel format.
    const decoded = jpeg.decode(source, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 512,
    });
    return { width: decoded.width, height: decoded.height, data: decoded.data };
  }
  return null;
}

/// Area-average ("box") sampling.
///
/// Nearest-neighbour would be a few lines shorter and looks terrible here: a
/// 2000px upload down to a 90px thumbnail throws away 99.8% of the pixels, and
/// picking one survivor per destination pixel produces the jagged, sparkling
/// result that makes a photo look like a mistake. Averaging the whole source
/// rectangle behind each destination pixel is what makes the small sizes read
/// as a face.
///
/// Alpha is premultiplied before averaging and divided out afterwards.
/// Averaging raw RGBA instead lets fully transparent pixels drag colour into
/// their neighbours, which haloes the crest's edges against a dark pass.
function sampleBox(
  source: RasterImage,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number
): [number, number, number, number] {
  const x0 = Math.max(0, Math.floor(sx0));
  const y0 = Math.max(0, Math.floor(sy0));
  const x1 = Math.min(source.width, Math.max(x0 + 1, Math.ceil(sx1)));
  const y1 = Math.min(source.height, Math.max(y0 + 1, Math.ceil(sy1)));

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let y = y0; y < y1; y++) {
    const rowStart = y * source.width * 4;
    for (let x = x0; x < x1; x++) {
      const i = rowStart + x * 4;
      const alpha = source.data[i + 3];
      const weight = alpha / 255;
      r += source.data[i] * weight;
      g += source.data[i + 1] * weight;
      b += source.data[i + 2] * weight;
      a += alpha;
      count++;
    }
  }

  if (count === 0) return [0, 0, 0, 0];

  const meanAlpha = a / count;
  if (meanAlpha === 0) return [0, 0, 0, 0];

  // Divide by the summed alpha weight, not by `count`: that is what turns the
  // premultiplied sums back into a straight colour.
  const weightSum = a / 255;
  return [
    Math.round(r / weightSum),
    Math.round(g / weightSum),
    Math.round(b / weightSum),
    Math.round(meanAlpha),
  ];
}

/// Resize to exactly width x height and encode as PNG, in pure JavaScript.
///
/// Returns null when the bytes are neither PNG nor JPEG, or when decoding
/// fails; callers treat that as "try something else" rather than as an error.
export function resizeToPngSync(
  source: Buffer,
  options: ResizeToPngOptions
): Buffer | null {
  let image: RasterImage | null;
  try {
    image = decode(source);
  } catch {
    return null;
  }
  if (!image || image.width < 1 || image.height < 1) return null;

  const { width, height } = options;
  const fit: ResizeFit = options.fit ?? "cover";

  const scale =
    fit === "contain"
      ? Math.min(width / image.width, height / image.height)
      : Math.max(width / image.width, height / image.height);

  const drawWidth = Math.max(1, image.width * scale);
  const drawHeight = Math.max(1, image.height * scale);

  // Centred: "cover" crops the overflow evenly on both sides, "contain" leaves
  // equal transparent margins. Either way the subject stays in the middle,
  // which for a profile photo is where the face is.
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;

  const out = new PNG({ width, height });
  // Transparent everywhere the source does not reach (only possible under
  // "contain"). PNG buffers arrive zero-filled, so this is already true; the
  // loop below simply skips those pixels.

  for (let y = 0; y < height; y++) {
    // The source rectangle behind this destination row.
    const sy0 = (y - offsetY) / scale;
    const sy1 = (y + 1 - offsetY) / scale;
    if (sy1 <= 0 || sy0 >= image.height) continue;

    for (let x = 0; x < width; x++) {
      const sx0 = (x - offsetX) / scale;
      const sx1 = (x + 1 - offsetX) / scale;
      if (sx1 <= 0 || sx0 >= image.width) continue;

      const [r, g, b, a] = sampleBox(image, sx0, sy0, sx1, sy1);
      const o = (y * width + x) * 4;
      out.data[o] = r;
      out.data[o + 1] = g;
      out.data[o + 2] = b;
      out.data[o + 3] = a;
    }
  }

  return PNG.sync.write(out);
}

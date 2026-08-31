/**
 * Shrinks a picture in the browser before it is uploaded.
 *
 * Uploads used to send the camera original — 15, 25, sometimes 40 MB off a
 * modern phone — and fail with a 413. Raising the route's own limit does not
 * help: Netlify caps a function's request body at 6 MB and rejects anything
 * larger before the handler runs at all, so the ceiling was never ours to
 * lift.
 *
 * It was also wasted bandwidth. The server resizes every upload to 2000px on
 * its longest edge, so everything above that was carried across the network
 * only to be thrown away. Doing the same resize here first means the request
 * is about a megabyte whatever the camera produced, uploads finish faster on
 * cellular, and the platform limit stops being reachable in normal use.
 */

/// Matches MAX_EDGE in app/api/newsletters/images/route.ts. Shrinking further
/// here would throw away detail the server intends to keep.
export const UPLOAD_MAX_EDGE = 2000;

/// Deliberately higher than the server's 82. The picture is encoded twice —
/// once here, once by sharp — and starting high keeps the second pass from
/// compounding into visible artefacts.
const QUALITY = 0.92;

export async function prepareImageForUpload(file: File): Promise<File> {
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    // `from-image` applies the EXIF orientation tag while decoding. Without it
    // a canvas re-encode drops that tag and every photo taken sideways would
    // arrive sideways — the server's `.rotate()` cannot recover an orientation
    // that is no longer recorded.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // A format this browser cannot decode — HEIC outside Safari, most often.
    // Send the original and let sharp deal with it server-side.
    return file;
  }

  try {
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, UPLOAD_MAX_EDGE / longestEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob) return file;

    // An already-small PNG can come back *bigger* as a JPEG. Keep whichever is
    // smaller, since the only goal here is getting under the limit.
    if (blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

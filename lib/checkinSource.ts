/**
 * How somebody got onto the attendance list, in words.
 *
 * Two halves. `canonicalCheckInSource` is what the server writes: a short,
 * fixed token per path, decided by the route rather than by whatever the
 * client felt like sending. That is the fix for a real bug — the web page's
 * manual check-in used to post `source: "Phone"`, so a member added by hand
 * appeared on the roster as though somebody had scanned their code.
 *
 * `describeCheckInSource` is what a human reads. It also carries the older
 * values, because rows already in the database say "Phone" and cannot be
 * re-derived — a legacy "Phone" row could have been either a scan or a
 * hand-added member, and it is shown as a scan because that is what the
 * scanner wrote for most of them.
 */

export type CheckInPath = "qr" | "wallet" | "manual" | "nfc";

const CANONICAL: Record<CheckInPath, string> = {
  qr: "QR",
  wallet: "Wallet",
  manual: "Manual",
  nfc: "NFC",
};

/** The value stored on the attendance row. Routes call this, not clients. */
export function canonicalCheckInSource(path: CheckInPath): string {
  return CANONICAL[path];
}

const LABELS: Record<string, string> = {
  qr: "QR code",
  // What the scanner posted before the paths were named apart.
  phone: "QR code",
  scan: "QR code",
  scanner: "QR code",
  wallet: "Wallet pass",
  "wallet pass": "Wallet pass",
  manual: "Added by hand",
  officer: "Added by hand",
  nfc: "NFC tag",
};

export function describeCheckInSource(entry: any): string {
  if (!entry) return "";
  const raw = typeof entry.source === "string" ? entry.source.trim() : "";
  if (!raw) return "";

  const label = LABELS[raw.toLowerCase()] || raw;

  // Which tag, when there was one. An event with a front door and a side
  // entrance wants its roster to say which one somebody came through.
  if (raw.toLowerCase() === "nfc" && entry.boothLabel) {
    return `${label} · ${entry.boothLabel}`;
  }
  return label;
}

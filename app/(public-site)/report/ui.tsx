"use client";

// Shared pieces for /report and /report/[ref], in the public site's palette:
// dark page, cream cards, maroon type. The public site has one theme.
import * as React from "react";
import { ImagePlus, X } from "lucide-react";

import { prepareImageForUpload } from "@/lib/prepareImageUpload";
import { MAX_SCREENSHOTS, SCREENSHOT_MAX_BYTES } from "@/lib/bugs/constants";

// Opaque tints with dark ink, so a pill reads on the dark page and on cream.
const STATUS_TONE: Record<string, string> = {
  received: "bg-[#e6dfc9] text-[#2b1d1d]",
  triaged: "bg-[#bfdcf0] text-[#0c3a57]",
  in_progress: "bg-[#f5d79a] text-[#5c3d00]",
  fixed: "bg-[#bfe5cb] text-[#0f4a26]",
  wont_fix: "bg-[#d9d3c3] text-[#4a3f3f]",
  duplicate: "bg-[#d9d3c3] text-[#4a3f3f]",
  closed_by_reporter: "bg-[#d9d3c3] text-[#4a3f3f]",
};

export function StatusPill({ status, label: text }: { status: string; label: string }) {
  return <span className={`tt-pill shrink-0 whitespace-nowrap ${STATUS_TONE[status] || STATUS_TONE.received}`}>{text}</span>;
}

/// Up to three screenshots, uploaded as soon as they are picked.
export function ScreenshotPicker({
  keys,
  onChange,
  id,
}: {
  keys: { key: string; preview: string }[];
  onChange: (next: { key: string; preview: string }[]) => void;
  id: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const ref = React.useRef<HTMLInputElement>(null);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    const next = [...keys];
    try {
      for (const file of Array.from(files).slice(0, MAX_SCREENSHOTS - keys.length)) {
        const prepared = await prepareImageForUpload(file);
        if (prepared.size > SCREENSHOT_MAX_BYTES) throw new Error("Each screenshot must be under 8 MB.");
        const body = new FormData();
        body.append("file", prepared);
        const res = await fetch("/api/report/upload", { method: "POST", body });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Upload failed");
        next.push({ key: json.key, preview: URL.createObjectURL(prepared) });
      }
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      onChange(next);
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {keys.map((shot) => (
          <div key={shot.key} className="relative size-14 overflow-hidden rounded-lg border border-[#1b0f0f]/15 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.preview} alt="Screenshot to attach" className="size-full object-cover" />
            <button
              type="button"
              aria-label="Remove screenshot"
              onClick={() => onChange(keys.filter((k) => k.key !== shot.key))}
              className="absolute right-0.5 top-0.5 rounded bg-[#1b0f0f]/80 p-0.5 text-white"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </div>
        ))}
        {keys.length < MAX_SCREENSHOTS ? (
          <>
            <input
              ref={ref}
              id={id}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => add(e.target.files)}
            />
            <label
              htmlFor={id}
              className={`flex h-14 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#1b0f0f]/30 bg-white/50 px-3 text-[13px] font-medium text-[#1b0f0f]/75 transition hover:border-[#7a0104] hover:text-[#7a0104] ${busy ? "opacity-50" : ""}`}
            >
              <ImagePlus className="size-4" aria-hidden="true" />
              {busy ? "Uploading" : `Add screenshots, up to ${MAX_SCREENSHOTS}`}
            </label>
          </>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-[13px] text-[#b3202a]">{error}</p> : null}
    </div>
  );
}

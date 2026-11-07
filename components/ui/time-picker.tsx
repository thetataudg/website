"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Time field that matches `DatePicker`: an outline button that opens a
 * popover, never the browser's own time wheel. The value is `HH:mm` (24h)
 * or "" for no time.
 *
 * The list offers every 15 minutes; the box at the top takes anything typed
 * ("7", "7:45p", "19:45").
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function formatTime(value: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return "";
  const h = Number(match[1]);
  const m = match[2];
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** "7" → 07:00, "7:45p" → 19:45, "1945" → 19:45. */
export function parseTimeInput(input: string): string | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  const match = /^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/.exec(text);
  if (!match) return null;
  let h = Number(match[1]);
  const m = Number(match[2] ?? 0);
  const meridiem = match[3]?.[0];
  if (m > 59 || h > 23) return null;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    if (meridiem === "p" && h < 12) h += 12;
    if (meridiem === "a" && h === 12) h = 0;
  }
  return `${pad(h)}:${pad(m)}`;
}

const SLOTS = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

export function TimePicker({
  id,
  value,
  onChange,
  disabled,
  className,
  placeholder = "Add a time",
  clearable = true,
  "aria-label": ariaLabel = "Time",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  clearable?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);

  // Scroll the current (or 9 AM) slot into view when the list opens.
  React.useEffect(() => {
    if (!open) return;
    setDraft("");
    const target = value || "09:00";
    const nearest = SLOTS.reduce((best, slot) => (slot <= target ? slot : best), SLOTS[0]);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-slot="${nearest}"]`)
        ?.scrollIntoView({ block: "center" });
    });
  }, [open, value]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };
  const typed = draft ? parseTimeInput(draft) : null;

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={value ? `${ariaLabel}: ${formatTime(value)}` : ariaLabel}
          className={cn("w-full justify-start font-normal", className)}
        >
          <Clock aria-hidden="true" />
          {value ? formatTime(value) : <span className="text-muted-foreground">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <form
          className="border-b border-border p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (typed) pick(typed);
          }}
        >
          <Input
            aria-label="Type a time"
            placeholder="Type a time, like 7:30p"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8 text-sm"
          />
          {draft && typed ? (
            <button
              type="submit"
              className="mt-1 w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
            >
              Use {formatTime(typed)}
            </button>
          ) : null}
        </form>
        <div ref={listRef} role="listbox" aria-label={ariaLabel} className="max-h-60 overflow-y-auto p-1">
          {SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              role="option"
              aria-selected={slot === value}
              data-slot={slot}
              onClick={() => pick(slot)}
              className={cn(
                "flex w-full items-center rounded px-2 py-1.5 text-left text-sm tabular-nums hover:bg-accent",
                slot === value && "bg-primary text-primary-foreground hover:bg-primary"
              )}
            >
              {formatTime(slot)}
            </button>
          ))}
        </div>
        {clearable && value ? (
          <div className="border-t border-border p-2">
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => pick("")}>
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

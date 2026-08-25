"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A date and a time, as one field.
 *
 * Built from the same primitives as `DatePicker` — a `Calendar` in a `Popover`
 * beside a time field — rather than a native `datetime-local`, whose picker is
 * the browser's and looks like the browser's: a blue Safari sheet in the
 * middle of a form that is otherwise entirely ours.
 *
 * The value stays a `YYYY-MM-DDTHH:mm` string, exactly what the native input
 * produced, so everything reading or writing it is untouched.
 */

export function parseDateTimeLocal(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return undefined;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );
}

export function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** The `HH:mm` half, which is what the time field binds to. */
function timePart(value: string): string {
  const match = /T(\d{2}:\d{2})/.exec(value);
  return match ? match[1] : "";
}

export function DateTimePicker({
  id,
  value,
  onChange,
  disabled,
  required,
  className,
  placeholder = "Pick a date",
}: {
  id?: string;
  /** `YYYY-MM-DDTHH:mm`, or empty. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDateTimeLocal(value);

  /** Keeps the half the user didn't touch, defaulting a missing time to 6pm. */
  const write = (date: Date | undefined, time: string) => {
    if (!date) {
      onChange("");
      return;
    }
    const [hours, minutes] = (time || "18:00").split(":").map(Number);
    const next = new Date(date);
    next.setHours(hours || 0, minutes || 0, 0, 0);
    onChange(toDateTimeLocal(next));
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="min-w-0 flex-1 justify-start px-3 font-normal"
          >
            <CalendarIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {selected ? (
                selected.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            autoFocus
            onSelect={(date) => {
              write(date, timePart(value));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      <Input
        type="time"
        aria-label="Time"
        className="w-[6.75rem] shrink-0 px-2"
        disabled={disabled}
        required={required}
        value={timePart(value)}
        onChange={(change) =>
          write(selected ?? new Date(), change.target.value)
        }
      />
    </div>
  );
}

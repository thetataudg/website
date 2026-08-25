"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * "YYYY-MM-DD" -> Date built from local components.
 *
 * `new Date("2026-08-23")` parses as UTC midnight, which renders as the day
 * before in any negative-offset zone. These values are calendar days, so they
 * have to be read and written as ones.
 */
export function parseYmd(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toYmd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

/**
 * Calendar-backed date field. The value stays a `YYYY-MM-DD` string, so it
 * drops into anything that previously used `<input type="date">` without
 * changing what gets submitted.
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className,
  clearable = false,
  minDate,
  maxDate,
  "aria-describedby": ariaDescribedby,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Adds a "Clear" action for optional fields such as filter ranges. */
  clearable?: boolean;
  /** Days outside these bounds cannot be picked. */
  minDate?: Date;
  maxDate?: Date;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parseYmd(value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-describedby={ariaDescribedby}
          className={cn("w-full justify-start font-normal", className)}
        >
          <CalendarIcon aria-hidden="true" />
          {selected ? (
            selected.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          disabled={
            minDate || maxDate
              ? { before: minDate as Date, after: maxDate as Date }
              : undefined
          }
          autoFocus
          onSelect={(date) => {
            if (!date) return;
            onChange(toYmd(date));
            setOpen(false);
          }}
        />
        {clearable && value ? (
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

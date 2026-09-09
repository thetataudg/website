"use client";

// components/availability/AvailabilityGrid.tsx
// One grid, two jobs: paint your own availability, or read the group's as a
// heatmap. A week-view calendar — real time gutter, day columns with dividers,
// hour lines, a cursor tooltip that names the exact slot — in the chapter's
// own colours.
//
//   flatIndex = columnIndex * slotsPerDay + slotIndex
//   slotsPerDay = floor((dayEndMinute - dayStartMinute) / slotMinutes)
import * as React from "react";
import { cn } from "@/lib/utils";

export interface GridColumn {
  key: string;
  /// Big label ("Tue", "Every Tue").
  top: string;
  /// Small label under it ("Sep 14"). Optional — weekday polls have none.
  bottom?: string;
}

export interface AvailabilityGridProps {
  columns: GridColumn[];
  dayStartMinute: number;
  dayEndMinute: number;
  slotMinutes: number;
  mode: "paint" | "heatmap";
  value?: Set<number>;
  onChange?: (next: Set<number>) => void;
  heat?: Map<number, string[]>;
  respondentCount?: number;
  disabled?: boolean;
  /// `#RRGGBB` — the poll's committee colour. Tints the grid so it reads as
  /// that committee's, matching its events on the calendar. Falls back to the
  /// theme's primary.
  accentColor?: string | null;
}

function slotHeight(slotMinutes: number) {
  if (slotMinutes >= 60) return 46;
  if (slotMinutes >= 30) return 30;
  return 22;
}

function label(minute: number) {
  const wrapped = ((minute % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12} ${ampm}` : `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/// Resolves an accent to solid + alpha helpers. A `#RRGGBB` committee colour
/// becomes rgba(); no accent falls back to the theme's primary token.
function accentPalette(hex: string | null | undefined) {
  const m = hex ? /^#?([0-9a-fA-F]{6})$/.exec(hex.trim()) : null;
  if (!m) {
    return {
      solid: "hsl(var(--primary))",
      onSolid: "hsl(var(--primary-foreground))",
      alpha: (a: number) => `hsl(var(--primary) / ${a})`,
    };
  }
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return {
    solid: `rgb(${r} ${g} ${b})`,
    onSolid: "#ffffff",
    alpha: (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`,
  };
}

/// Fill + text colour for a heat cell, scaled by how much of the group is free.
function heatStyle(
  count: number,
  total: number,
  p: ReturnType<typeof accentPalette>
): { bg: string; fg: string } {
  if (total <= 0 || count <= 0) {
    return { bg: p.alpha(0.05), fg: "hsl(var(--muted-foreground))" };
  }
  const ratio = count / total;
  if (ratio >= 0.999) return { bg: p.solid, fg: p.onSolid };
  if (ratio >= 0.6) return { bg: p.alpha(0.55), fg: p.onSolid };
  return { bg: p.alpha(0.14 + ratio * 0.3), fg: "hsl(var(--foreground))" };
}

export function AvailabilityGrid({
  columns,
  dayStartMinute,
  dayEndMinute,
  slotMinutes,
  mode,
  value,
  onChange,
  heat,
  respondentCount = 0,
  disabled,
  accentColor,
}: AvailabilityGridProps) {
  const p = accentPalette(accentColor);
  const CELL_H = slotHeight(slotMinutes);
  const slotsPerDay = Math.max(
    Math.floor((dayEndMinute - dayStartMinute) / slotMinutes),
    0
  );
  const selected = value ?? new Set<number>();

  const drag = React.useRef<{ erasing: boolean } | null>(null);
  const [tip, setTip] = React.useState<{
    x: number;
    y: number;
    text: string;
    sub: string;
  } | null>(null);

  const apply = React.useCallback(
    (flat: number, erasing: boolean) => {
      if (!onChange) return;
      const next = new Set(selected);
      if (erasing) next.delete(flat);
      else next.add(flat);
      onChange(next);
    },
    [onChange, selected]
  );

  const cellAt = (e: React.PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const host = el?.dataset?.flat !== undefined ? el : el?.closest?.("[data-flat]");
    const raw = (host as HTMLElement | null)?.dataset?.flat;
    return raw === undefined ? null : Number(raw);
  };

  const describe = (flat: number) => {
    const colIndex = Math.floor(flat / slotsPerDay);
    const slotIndex = flat % slotsPerDay;
    const start = dayStartMinute + slotIndex * slotMinutes;
    const col = columns[colIndex];
    const day = col ? (col.bottom ? `${col.top} ${col.bottom}` : col.top) : "";
    return {
      text: day,
      sub: `${label(start)} – ${label(start + slotMinutes)}`,
    };
  };

  const showTip = (e: React.PointerEvent, flat: number | null) => {
    if (flat === null) {
      setTip(null);
      return;
    }
    const d = describe(flat);
    setTip({ x: e.clientX, y: e.clientY, text: d.text, sub: d.sub });
  };

  const startPaint = (flat: number, shift: boolean) => {
    if (disabled || mode !== "paint") return;
    const erasing = shift || selected.has(flat);
    drag.current = { erasing };
    apply(flat, erasing);
  };

  const gridTemplateColumns = `3.25rem repeat(${columns.length}, minmax(2.75rem, 1fr))`;

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {/* toolbar */}
          <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            {mode === "paint"
              ? "Click or drag across the grid to fill in when you are free. Hold Shift and drag to erase."
              : "Hover a cell to see who is free at that time."}
          </div>

          {/* header */}
          <div
            className="grid border-b border-border bg-muted/40"
            style={{ gridTemplateColumns }}
          >
            <div />
            {columns.map((col, i) => (
              <div
                key={col.key}
                className={cn(
                  "px-1 py-2.5 text-center",
                  i > 0 && "border-l border-border"
                )}
              >
                <div className="text-sm font-semibold text-foreground">
                  {col.top}
                </div>
                {col.bottom && (
                  <div className="text-[11px] text-muted-foreground">
                    {col.bottom}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* body */}
          <div
            className="grid select-none touch-none"
            style={{ gridTemplateColumns }}
            onPointerUp={() => (drag.current = null)}
            onPointerLeave={() => {
              drag.current = null;
              setTip(null);
            }}
            onPointerMove={(e) => {
              const flat = cellAt(e);
              showTip(e, flat);
              if (drag.current && mode === "paint" && flat !== null) {
                apply(flat, drag.current.erasing);
              }
            }}
          >
            {Array.from({ length: slotsPerDay }).map((_, slotIndex) => {
              const minute = dayStartMinute + slotIndex * slotMinutes;
              const onHour = minute % 60 === 0;
              return (
                <React.Fragment key={slotIndex}>
                  <div className="relative pr-2" style={{ height: CELL_H }}>
                    {onHour && (
                      <span className="absolute right-2 -top-[7px] bg-card px-1 text-[10px] font-medium leading-none text-muted-foreground">
                        {label(minute).replace(":00", "")}
                      </span>
                    )}
                  </div>
                  {columns.map((col, colIndex) => {
                    const flat = colIndex * slotsPerDay + slotIndex;
                    const isSel = selected.has(flat);
                    const names = mode === "heatmap" ? heat?.get(flat) ?? [] : [];
                    const hs =
                      mode === "heatmap"
                        ? heatStyle(names.length, respondentCount, p)
                        : null;
                    const paintBg =
                      mode === "paint"
                        ? isSel
                          ? p.solid
                          : p.alpha(0.05)
                        : undefined;

                    return (
                      <div
                        key={col.key}
                        data-flat={flat}
                        onPointerDown={(e) => {
                          if (mode === "paint") {
                            e.preventDefault();
                            (e.target as HTMLElement).releasePointerCapture?.(
                              e.pointerId
                            );
                            startPaint(flat, e.shiftKey);
                          }
                        }}
                        className={cn(
                          "relative flex items-center justify-center transition-colors",
                          colIndex > 0 && "border-l border-border/70",
                          onHour
                            ? "border-t border-border"
                            : "border-t border-border/25",
                          mode === "paint" &&
                            !disabled &&
                            "cursor-pointer hover:brightness-95"
                        )}
                        style={{
                          height: CELL_H,
                          ...(hs
                            ? { backgroundColor: hs.bg, color: hs.fg }
                            : paintBg
                            ? { backgroundColor: paintBg }
                            : {}),
                        }}
                      >
                        {mode === "heatmap" && names.length > 0 && (
                          <span className="text-[11px] font-semibold tabular-nums">
                            {names.length}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>

          {/* legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            {mode === "paint" ? (
              <>
                <span className="font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Legend
                </span>
                <LegendItem
                  label="You're free"
                  style={{ backgroundColor: p.solid }}
                />
                <LegendItem
                  label="Not free"
                  style={{
                    backgroundColor: p.alpha(0.05),
                    borderColor: "hsl(var(--border))",
                  }}
                />
              </>
            ) : (
              <>
                <span className="font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Free
                </span>
                <LegendItem label="Everyone" style={{ backgroundColor: p.solid }} />
                <LegendItem label="Most" style={{ backgroundColor: p.alpha(0.55) }} />
                <LegendItem label="Some" style={{ backgroundColor: p.alpha(0.24) }} />
                <LegendItem
                  label="None"
                  style={{
                    backgroundColor: p.alpha(0.05),
                    borderColor: "hsl(var(--border))",
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* cursor tooltip */}
      {tip && tip.text && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background shadow-lg"
          style={{ left: tip.x + 14, top: tip.y + 14 }}
        >
          <span className="font-semibold">{tip.text}</span>
          <span className="opacity-80"> · {tip.sub}</span>
        </div>
      )}
    </div>
  );
}

function LegendItem({
  label: text,
  style,
}: {
  label: string;
  style: React.CSSProperties;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block size-3 rounded-[3px] border border-transparent"
        style={style}
      />
      {text}
    </span>
  );
}

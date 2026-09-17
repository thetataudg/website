"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { PipetteIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * A saturation/brightness field, a hue rail, an eyedropper and an editable
 * value, in the shape of the shadcn.io color picker.
 *
 * Written against HSV rather than HSL. The field is a square whose corners are
 * white, pure hue, and black twice over, which is exactly HSV: x is saturation
 * and y is value, so the handle sits where the color actually is. Mapping that
 * square onto HSL needs a correction that drifts the handle away from the
 * pointer. No alpha: a hex is what mail clients honour, and a translucent
 * text color renders differently in every one of them.
 */

type Hsv = { h: number; s: number; v: number };

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const full = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const d = max - Math.min(rr, gg, bb);
  let h = 0;
  if (d) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return [Math.round(rgbToHsv(r, g, b).h), Math.round(s * 100), Math.round(l * 100)];
}

type Format = "hex" | "rgb" | "hsl";

export function ColorPicker({
  value,
  onChange,
  className,
}: {
  /** `#rrggbb`. */
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}) {
  const [hsv, setHsv] = React.useState<Hsv>(() => {
    const rgb = hexToRgb(value) ?? [99, 102, 241];
    return rgbToHsv(...rgb);
  });
  const [format, setFormat] = React.useState<Format>("hex");
  const hex = rgbToHex(...hsvToRgb(hsv));
  const lastEmitted = React.useRef(hex);

  // A value set from outside (a swatch, a typed hex) moves the handles. The
  // one we just emitted doesn't, or grey and black would lose their hue.
  React.useEffect(() => {
    if (value.toLowerCase() === lastEmitted.current.toLowerCase()) return;
    const rgb = hexToRgb(value);
    if (rgb) setHsv((current) => {
      const next = rgbToHsv(...rgb);
      return next.s === 0 || next.v === 0 ? { ...next, h: current.h } : next;
    });
  }, [value]);

  const update = React.useCallback(
    (next: Hsv) => {
      setHsv(next);
      const nextHex = rgbToHex(...hsvToRgb(next));
      lastEmitted.current = nextHex;
      onChange(nextHex);
    },
    [onChange]
  );

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <SaturationField hsv={hsv} onChange={update} />
      <HueRail hue={hsv.h} onChange={(h) => update({ ...hsv, h })} />
      <div className="flex items-center gap-1.5">
        <EyeDropperButton
          onPick={(picked) => {
            const rgb = hexToRgb(picked);
            if (rgb) update(rgbToHsv(...rgb));
          }}
        />
        <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
          <SelectTrigger className="h-8 w-[4.25rem] shrink-0 px-2 text-xs" aria-label="Color format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["hex", "rgb", "hsl"] as Format[]).map((f) => (
              <SelectItem key={f} value={f} className="text-xs">
                {f.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormatFields format={format} hex={hex} onHex={(next) => {
          const rgb = hexToRgb(next);
          if (rgb) update(rgbToHsv(...rgb));
        }} />
      </div>
    </div>
  );
}

function SaturationField({ hsv, onChange }: { hsv: Hsv; onChange: (next: Hsv) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const hsvRef = React.useRef(hsv);
  hsvRef.current = hsv;

  const pick = React.useCallback(
    (clientX: number, clientY: number) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      onChange({
        h: hsvRef.current.h,
        s: clamp((clientX - rect.left) / rect.width),
        v: 1 - clamp((clientY - rect.top) / rect.height),
      });
    },
    [onChange]
  );

  const nudge = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const { h, s, v } = hsvRef.current;
    const moves: Record<string, Hsv> = {
      ArrowLeft: { h, s: clamp(s - step), v },
      ArrowRight: { h, s: clamp(s + step), v },
      ArrowUp: { h, s, v: clamp(v + step) },
      ArrowDown: { h, s, v: clamp(v - step) },
    };
    if (moves[event.key]) {
      event.preventDefault();
      onChange(moves[event.key]);
    }
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Saturation and brightness"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hsv.s * 100)}
      aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
      onKeyDown={nudge}
      onPointerDown={(event) => {
        event.preventDefault();
        (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
        pick(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.buttons & 1) pick(event.clientX, event.clientY);
      }}
      className="relative h-36 w-full cursor-crosshair touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
      }}
    >
      <div
        className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)] transition-[width,height] duration-100"
        style={{
          left: `${hsv.s * 100}%`,
          top: `${(1 - hsv.v) * 100}%`,
          backgroundColor: rgbToHex(...hsvToRgb(hsv)),
        }}
      />
    </div>
  );
}

function HueRail({ hue, onChange }: { hue: number; onChange: (hue: number) => void }) {
  return (
    <SliderPrimitive.Root
      className="relative flex h-4 w-full touch-none select-none items-center"
      min={0}
      max={359}
      step={1}
      value={[Math.round(hue)]}
      onValueChange={([h]) => onChange(h)}
      aria-label="Hue"
    >
      <SliderPrimitive.Track className="relative h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)]">
        <SliderPrimitive.Range className="absolute h-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block size-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ backgroundColor: `hsl(${hue} 100% 50%)` }}
      />
    </SliderPrimitive.Root>
  );
}

function EyeDropperButton({ onPick }: { onPick: (hex: string) => void }) {
  const [supported, setSupported] = React.useState(false);
  React.useEffect(() => setSupported(typeof window !== "undefined" && "EyeDropper" in window), []);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-8 shrink-0 text-muted-foreground"
      disabled={!supported}
      title={supported ? "Pick a color from the screen" : "Your browser can't pick colors from the screen"}
      aria-label="Pick a color from the screen"
      onClick={async () => {
        try {
          const result = await new (window as any).EyeDropper().open();
          if (result?.sRGBHex) onPick(result.sRGBHex);
        } catch {
          /* dismissed with Escape */
        }
      }}
    >
      <PipetteIcon className="size-4" />
    </Button>
  );
}

/// The value in the chosen notation. Every field can be typed into; a value is
/// only taken once it parses, so a half-typed "#6" doesn't turn the text black.
function FormatFields({ format, hex, onHex }: { format: Format; hex: string; onHex: (hex: string) => void }) {
  const rgb = hexToRgb(hex) ?? [0, 0, 0];
  const field = "h-8 min-w-0 flex-1 rounded-none bg-muted px-2 text-center font-mono text-xs shadow-none first:rounded-l-md last:rounded-r-md focus-visible:z-10";

  if (format === "hex") {
    return <HexField hex={hex} onHex={onHex} className={cn(field, "rounded-md text-left")} />;
  }

  const channels =
    format === "rgb"
      ? rgb.map(Math.round)
      : rgbToHsl(...rgb);
  const limits = format === "rgb" ? [255, 255, 255] : [359, 100, 100];
  const names = format === "rgb" ? ["Red", "Green", "Blue"] : ["Hue", "Saturation", "Lightness"];

  const set = (index: number, raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const next = [...channels];
    next[index] = clamp(Math.round(n), 0, limits[index]);
    if (format === "rgb") {
      onHex(rgbToHex(next[0], next[1], next[2]));
    } else {
      // HSL back to RGB via the standard formula.
      const [h, s, l] = [next[0], next[1] / 100, next[2] / 100];
      const a = s * Math.min(l, 1 - l);
      const f = (k: number) => {
        const m = (k + h / 30) % 12;
        return (l - a * Math.max(-1, Math.min(m - 3, 9 - m, 1))) * 255;
      };
      onHex(rgbToHex(f(0), f(8), f(4)));
    }
  };

  return (
    <div className="flex min-w-0 flex-1 -space-x-px">
      {channels.map((value, index) => (
        <Input
          key={`${format}-${index}`}
          inputMode="numeric"
          aria-label={names[index]}
          className={field}
          value={value}
          onChange={(event) => set(index, event.target.value)}
        />
      ))}
    </div>
  );
}

function HexField({ hex, onHex, className }: { hex: string; onHex: (hex: string) => void; className?: string }) {
  const [draft, setDraft] = React.useState(hex);
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => {
    if (!editing) setDraft(hex);
  }, [hex, editing]);

  return (
    <Input
      aria-label="Hex color"
      spellCheck={false}
      maxLength={7}
      className={className}
      value={editing ? draft : hex.toUpperCase()}
      onFocus={() => {
        setEditing(true);
        setDraft(hex.toUpperCase());
      }}
      onBlur={() => setEditing(false)}
      onChange={(event) => {
        const next = event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`;
        setDraft(next);
        if (/^#[0-9a-f]{6}$/i.test(next)) onHex(next.toLowerCase());
      }}
    />
  );
}

"use client";

import * as React from "react";
import { Loader2, MapPin } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useMapKit } from "@/lib/useMapKit";

/**
 * A location field that suggests real places as you type.
 *
 * The web half of the iOS event form's `LocationField`, and deliberately the
 * same shape: Apple's own place index, three characters before it asks, four
 * suggestions, and the street address folded into the value because that is
 * the half somebody standing outside actually needs.
 *
 * Typing always wins. "Vinny's apartment" is a perfectly good location for a
 * committee meeting and no map will ever suggest it, so the field is a plain
 * text input that happens to offer help — never a picker. That is also what
 * makes the failure case free: if MapKit cannot load, or the deployment has no
 * token, this is an `Input` and nothing is said about it.
 */

/** Least a query can be before it is worth a round trip to Apple. */
const MIN_QUERY = 3;
/** More rows than this stops being a shortlist and starts being a result page. */
const MAX_RESULTS = 4;
/** Long enough that a fast typist makes one request, not eight. */
const DEBOUNCE_MS = 220;

interface Suggestion {
  title: string;
  subtitle: string;
  /** What lands in the field. */
  value: string;
}

/** MapKit hands back display lines; the first is the name, the rest the address. */
function toSuggestion(result: any): Suggestion | null {
  const lines: string[] = Array.isArray(result?.displayLines)
    ? result.displayLines.filter((line: unknown) => typeof line === "string" && line.trim())
    : [];
  const title = lines[0]?.trim();
  if (!title) return null;
  const subtitle = lines.slice(1).join(", ").trim();
  return { title, subtitle, value: subtitle ? `${title}, ${subtitle}` : title };
}

export interface LocationInputProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Input>, "value" | "onChange"> {
  value: string;
  onValueChange: (value: string) => void;
}

export function LocationInput({
  value,
  onValueChange,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: LocationInputProps) {
  // MapKit's script is ~400KB from Apple's CDN, so it is not fetched until
  // somebody actually puts a cursor in this field.
  const [wanted, setWanted] = React.useState(false);
  const { mapkit, status } = useMapKit(wanted);

  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [searching, setSearching] = React.useState(false);
  // Set once Apple has refused us — a bad or expired token fails identically
  // on every keystroke, and a field that spins forever is worse than one that
  // never offered to help.
  const [unavailable, setUnavailable] = React.useState(false);

  // The text last written *into* the field by a pick. Held so choosing a
  // suggestion does not immediately search for its own result.
  const chosen = React.useRef<string | null>(null);
  const searcher = React.useRef<any>(null);
  const inflight = React.useRef<any>(null);

  React.useEffect(() => {
    if (!mapkit || searcher.current) return;
    searcher.current = new mapkit.Search({
      includeAddresses: true,
      includePointsOfInterest: true,
      // "Coffee near me" is a query to run, not a place to meet at.
      includeQueries: false,
    });
  }, [mapkit]);

  const query = value.trim();

  React.useEffect(() => {
    if (status !== "ready" || unavailable || !searcher.current) return;
    if (chosen.current !== null && chosen.current === value) return;
    if (query.length < MIN_QUERY) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    let live = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      // Apple bills per request and answers out of order; cancelling the last
      // one keeps a stale reply from overwriting a newer one.
      if (inflight.current !== null) {
        try {
          searcher.current.cancel(inflight.current);
        } catch {
          /* already delivered */
        }
      }
      inflight.current = searcher.current.autocomplete(
        query,
        (error: unknown, data: any) => {
          inflight.current = null;
          if (!live) return;
          setSearching(false);
          if (error) {
            // Offline, or a token Apple will not accept. The field still takes
            // free text, so nothing is said — it simply stops offering.
            setUnavailable(true);
            setSuggestions([]);
            setOpen(false);
            return;
          }
          const found = (data?.results ?? [])
            .map(toSuggestion)
            .filter(Boolean)
            .slice(0, MAX_RESULTS) as Suggestion[];
          setSuggestions(found);
          setActive(0);
          setOpen(found.length > 0);
        }
      );
    }, DEBOUNCE_MS);

    return () => {
      live = false;
      window.clearTimeout(timer);
      setSearching(false);
    };
  }, [query, value, status, unavailable]);

  function pick(suggestion: Suggestion) {
    chosen.current = suggestion.value;
    onValueChange(suggestion.value);
    setSuggestions([]);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      // Only when a row is highlighted, so Enter still submits the form for
      // somebody who typed an address the map has never heard of.
      event.preventDefault();
      pick(suggestions[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            {...props}
            value={value}
            autoComplete="off"
            onChange={(change) => {
              chosen.current = null;
              onValueChange(change.target.value);
            }}
            onFocus={(event) => {
              setWanted(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              // Late enough for a click on a row to land first.
              window.setTimeout(() => setOpen(false), 120);
              onBlur?.(event);
            }}
            onKeyDown={handleKeyDown}
          />
          {searching && (
            // The positioning and the spin have to live on different elements:
            // `animate-spin` animates `transform`, which would overwrite the
            // centring translate and leave the icon rotating about a point
            // below itself — a bob, not a spin.
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
            </span>
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] p-0"
        // The cursor stays in the field: this is an accelerator for typing,
        // not a menu that takes over from it.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <Command shouldFilter={false} value={String(active)}>
          <CommandList>
            <CommandEmpty>No places found.</CommandEmpty>
            {suggestions.map((suggestion, index) => (
              <CommandItem
                key={`${suggestion.title}|${suggestion.subtitle}`}
                value={String(index)}
                onMouseEnter={() => setActive(index)}
                onSelect={() => pick(suggestion)}
                className="gap-2.5"
              >
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate">{suggestion.title}</span>
                  {suggestion.subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {suggestion.subtitle}
                    </span>
                  )}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

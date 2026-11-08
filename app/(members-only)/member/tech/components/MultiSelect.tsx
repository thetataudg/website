"use client";

// A multi-select combobox from `command` + `popover`, for assignees and tags.
import * as React from "react";
import { Check, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface MultiOption {
  value: string;
  label: string;
  leading?: React.ReactNode;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder = "Search",
  emptyText = "Nothing found.",
  onCreate,
  children,
  open: controlledOpen,
  onOpenChange,
  single = false,
}: {
  options: MultiOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /// Offered as "Create <query>" when nothing matches exactly.
  onCreate?: (name: string) => Promise<string | null>;
  /// The trigger. A button-like element.
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  single?: boolean;
}) {
  const [innerOpen, setInnerOpen] = React.useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = (next: boolean) => {
    setInnerOpen(next);
    onOpenChange?.(next);
  };
  const [query, setQuery] = React.useState("");
  const selected = new Set(value);
  const exact = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  const toggle = (id: string) => {
    if (single) {
      onChange(selected.has(id) ? [] : [id]);
      setOpen(false);
      return;
    }
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{onCreate && query.trim() ? null : emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => toggle(option.value)}
                >
                  <Check
                    className={cn("size-4", selected.has(option.value) ? "opacity-100" : "opacity-0")}
                    aria-hidden="true"
                  />
                  {option.leading}
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
              {onCreate && query.trim() && !exact ? (
                <CommandItem
                  value={`__create ${query}`}
                  onSelect={async () => {
                    const id = await onCreate(query.trim());
                    if (id) onChange(single ? [id] : [...value, id]);
                    setQuery("");
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Create &ldquo;{query.trim()}&rdquo;
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
        {placeholder ? <span className="sr-only">{placeholder}</span> : null}
      </PopoverContent>
    </Popover>
  );
}

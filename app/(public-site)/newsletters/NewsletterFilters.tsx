"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NEWSLETTER_CATEGORIES } from "@/lib/newsletterTypes";
import { CATEGORY_LABELS } from "./categories";

/**
 * Search and category filters for the public archive.
 *
 * State lives in the URL rather than in this component. `/newsletters?q=rush`
 * is a link somebody can send, a page a crawler can index, and a result the
 * back button returns to. Holding it in React state would have made all three
 * impossible for the sake of avoiding a round trip on a page that publishes
 * about once a month.
 */
export default function NewsletterFilters({
  query,
  category,
  total,
}: {
  query: string;
  category: string;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(query);
  // The URL is the source of truth, so a back-button navigation has to be able
  // to put the box back to what that URL says.
  const typing = useRef(false);

  useEffect(() => {
    if (!typing.current) setText(query);
  }, [query]);

  function apply(next: { q?: string; category?: string }) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    // Any change to what is being looked for starts again from the first page.
    search.delete("page");
    const suffix = search.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }

  // Debounced, so typing "brotherhood" is one navigation rather than eleven.
  useEffect(() => {
    if (text === query) return;
    typing.current = true;
    const timer = setTimeout(() => {
      apply({ q: text.trim() });
      typing.current = false;
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="mb-8 space-y-3">
      <div className="relative max-w-md">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search newsletters"
          aria-label="Search newsletters"
          className="w-full rounded-full border border-white/15 bg-white/[0.06] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/40 focus:border-[#f5d79a]/60 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label="All" active={!category} onClick={() => apply({ category: "" })} />
        {NEWSLETTER_CATEGORIES.map((option) => (
          <FilterChip
            key={option}
            label={CATEGORY_LABELS[option]}
            active={category === option}
            // Tapping the active chip clears it, so the filter row does not
            // need a separate reset control.
            onClick={() => apply({ category: category === option ? "" : option })}
          />
        ))}
        <span className="ml-auto text-xs text-white/40" aria-live="polite">
          {total === 1 ? "1 newsletter" : `${total} newsletters`}
        </span>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] transition ${
        active
          ? "bg-[#f5d79a] text-[#1b0f0f]"
          : "bg-white/[0.06] text-white/60 hover:bg-white/[0.12] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

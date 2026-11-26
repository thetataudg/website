"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { budgetFetch, dateTime, money } from "./api";
import { RowsSkeleton } from "./ui";

interface EventRow {
  _id: string;
  type: string;
  occurredAt: string;
  committeeName: string;
  actor: string;
  amountCents: number | null;
  summary: string;
}

/// The action log, newest first, 50 at a time.
export function ActivityLog({ committeeId, term, showCommittee = false, refreshKey = 0 }: { committeeId?: string; term?: string; showCommittee?: boolean; refreshKey?: number }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (committeeId) params.set("committeeId", committeeId);
        if (term) params.set("term", term);
        if (before) params.set("before", before);
        const data = await budgetFetch<{ events: EventRow[]; nextBefore: string | null }>(`/api/budgets/events?${params}`);
        setEvents((current) => (before ? [...current, ...data.events] : data.events));
        setNext(data.nextBefore);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [committeeId, term]
  );

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (error) return <p className="px-6 py-4 text-sm text-destructive">{error}</p>;
  if (loading && !events.length) return <RowsSkeleton rows={5} label="Loading activity…" />;
  if (!events.length) return <p className="px-6 py-10 text-center text-sm text-muted-foreground">Nothing has happened yet.</p>;

  return (
    <div>
      <ol className="divide-y divide-border p-0">
        {events.map((e) => (
          <li key={e._id} className="flex list-none items-start justify-between gap-4 px-6 py-3.5">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{e.summary}</p>
              <p className="text-xs text-muted-foreground">
                {dateTime(e.occurredAt)} · {e.actor}
                {showCommittee ? ` · ${e.committeeName}` : ""}
              </p>
            </div>
            {e.amountCents !== null ? (
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{money(e.amountCents)}</span>
            ) : null}
          </li>
        ))}
      </ol>
      {next ? (
        <div className="border-t border-border px-6 py-3">
          <Button variant="ghost" size="sm" onClick={() => void load(next)} disabled={loading}>
            {loading ? "Loading…" : "Show older"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

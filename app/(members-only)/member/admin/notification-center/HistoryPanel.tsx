"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, History, Loader2, Minus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CHANNEL_LABELS, type BroadcastSummary } from "./types";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const REASON_LABELS: Record<string, string> = {
  "no registered device": "No app installed",
  "no device accepted it": "Device rejected it",
  "no email on file": "No email on file",
  "no account": "No account",
  "not configured": "Not configured",
};

function reasonLabel(reason?: string) {
  if (!reason) return "Not delivered";
  if (reason.startsWith("not configured")) return "Not configured";
  return REASON_LABELS[reason] ?? reason;
}

export default function HistoryPanel({
  openId,
  onOpenChange,
  refreshKey,
}: {
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  refreshKey: number;
}) {
  const [items, setItems] = useState<BroadcastSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (before?: string) => {
    const url = new URL("/api/admin/notification-center/history", window.location.origin);
    if (before) url.searchParams.set("before", before);
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Could not load history.");
    return data as { items: BroadcastSummary[]; nextCursor: string | null };
  }, []);

  const refresh = useCallback(() => {
    load()
      .then((data) => {
        setItems(data.items);
        setNextCursor(data.nextCursor);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [load]);

  useEffect(refresh, [refresh, refreshKey]);

  // Keep the list honest while anything on it is still going out.
  const anySending = items?.some((item) => item.status === "sending");
  useEffect(() => {
    if (!anySending) return;
    const timer = window.setInterval(refresh, 2500);
    return () => window.clearInterval(timer);
  }, [anySending, refresh]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await load(nextCursor);
      setItems((current) => [...(current ?? []), ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <Card>
        <CardContent className="p-0">
          {error ? (
            <p className="p-6 text-sm text-destructive">{error}</p>
          ) : items === null ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-12 text-center">
              <History className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="font-medium">Nothing sent yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Message</TableHead>
                  <TableHead className="hidden md:table-cell">Audience</TableHead>
                  <TableHead className="hidden sm:table-cell">Sent by</TableHead>
                  <TableHead className="text-right">Reached</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => onOpenChange(item.id)}
                  >
                    <TableCell className="max-w-0">
                      <div className="flex items-center gap-3">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="size-10 shrink-0 rounded-md object-cover"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate font-medium">
                            <span className="truncate">{item.title}</span>
                            {item.isTest ? <Badge variant="muted">Test</Badge> : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {dateFormat.format(new Date(item.createdAt))} ·{" "}
                            {item.channels.map((c) => CHANNEL_LABELS[c] ?? c).join(", ")}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-[16rem] truncate text-sm md:table-cell">
                      {item.audienceLabel}
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {item.sentByName || "Unknown"}
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusCell item={item} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {nextCursor ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      ) : null}

      <BroadcastSheet id={openId} onOpenChange={onOpenChange} />
    </>
  );
}

function StatusCell({ item }: { item: BroadcastSummary }) {
  if (item.status === "sending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Sending
      </span>
    );
  }
  if (item.status === "interrupted") return <Badge variant="warning">Interrupted</Badge>;
  if (item.status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return (
    <span className="text-sm tabular-nums">
      {item.reachedCount}
      <span className="text-muted-foreground">/{item.recipientCount}</span>
    </span>
  );
}

function BroadcastSheet({
  id,
  onOpenChange,
}: {
  id: string | null;
  onOpenChange: (id: string | null) => void;
}) {
  const [detail, setDetail] = useState<BroadcastSummary | null>(null);
  const [onlyMissed, setOnlyMissed] = useState(false);

  useEffect(() => {
    setDetail(null);
    setOnlyMissed(false);
    if (!id) return;
    let active = true;
    let timer: number | undefined;
    const fetchDetail = async () => {
      const res = await fetch(`/api/admin/notification-center/history/${id}`);
      if (!res.ok || !active) return;
      const data: BroadcastSummary = await res.json();
      setDetail(data);
      if (data.status === "sending") timer = window.setTimeout(fetchDetail, 2000);
    };
    void fetchDetail();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [id]);

  const recipients = useMemo(() => {
    const all = detail?.recipients ?? [];
    return onlyMissed
      ? all.filter((r) => !r.attempts.some((a) => a.delivered))
      : all;
  }, [detail, onlyMissed]);

  return (
    <Sheet open={Boolean(id)} onOpenChange={(open) => !open && onOpenChange(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {!detail ? (
          <div className="space-y-3 pt-8">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <SheetHeader className="text-left">
              <SheetTitle className="pr-6">{detail.title}</SheetTitle>
              <SheetDescription>
                {detail.sentByName || "Unknown"} ·{" "}
                {dateFormat.format(new Date(detail.createdAt))}
              </SheetDescription>
            </SheetHeader>

            <div className="flex gap-4 rounded-lg border p-4">
              <p className="min-w-0 flex-1 whitespace-pre-line text-sm">{detail.body}</p>
              {detail.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.imageUrl}
                  alt=""
                  className="size-20 shrink-0 rounded-md object-cover"
                />
              ) : null}
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Audience</dt>
                <dd className="font-medium">{detail.audienceLabel}</dd>
              </div>
              {detail.link ? (
                <div>
                  <dt className="text-muted-foreground">Link</dt>
                  <dd className="truncate font-medium">{detail.link}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground">Reached</dt>
                <dd className="font-medium tabular-nums">
                  {detail.status === "sending" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="size-3.5 animate-spin" /> Sending
                    </span>
                  ) : (
                    `${detail.reachedCount} of ${detail.recipientCount}`
                  )}
                </dd>
              </div>
              {detail.channels.map((channel) => (
                <div key={channel}>
                  <dt className="text-muted-foreground">{CHANNEL_LABELS[channel] ?? channel}</dt>
                  <dd className="font-medium tabular-nums">
                    {detail.channelCounts[channel] ?? 0} delivered
                  </dd>
                </div>
              ))}
            </dl>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Recipients ({detail.recipients?.length ?? 0})
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setOnlyMissed((v) => !v)}
                  disabled={detail.status === "sending"}
                >
                  {onlyMissed ? "Show everyone" : "Only not reached"}
                </Button>
              </div>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      {detail.channels.map((channel) => (
                        <TableHead key={channel} className="w-16 text-center">
                          {CHANNEL_LABELS[channel] ?? channel}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipients.map((recipient) => (
                      <TableRow key={recipient.memberId}>
                        <TableCell>
                          <p className="text-sm font-medium">{recipient.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[recipient.rollNo, recipient.status].filter(Boolean).join(" · ")}
                          </p>
                        </TableCell>
                        {detail.channels.map((channel) => {
                          const attempt = recipient.attempts.find((a) => a.channel === channel);
                          return (
                            <TableCell key={channel} className="text-center">
                              <AttemptMark
                                attempt={attempt}
                                pending={detail.status === "sending"}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                    {!recipients.length ? (
                      <TableRow>
                        <TableCell
                          colSpan={detail.channels.length + 1}
                          className="py-6 text-center text-sm text-muted-foreground"
                        >
                          Everyone was reached.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AttemptMark({
  attempt,
  pending,
}: {
  attempt?: { delivered: boolean; reason?: string };
  pending: boolean;
}) {
  if (!attempt) {
    return pending ? (
      <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" aria-label="Sending" />
    ) : (
      <Minus className="mx-auto size-4 text-muted-foreground" aria-label="Not attempted" />
    );
  }
  const label = attempt.delivered ? "Delivered" : reasonLabel(attempt.reason);
  return (
    <span title={label} className="inline-flex">
      {attempt.delivered ? (
        <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-label={label} />
      ) : (
        <X className={cn("size-4 text-muted-foreground")} aria-label={label} />
      )}
    </span>
  );
}

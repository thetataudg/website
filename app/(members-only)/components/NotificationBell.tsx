"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Notification = {
  _id: string;
  template: string;
  title: string;
  body: string;
  link: string;
  category: string;
  amountCents: number | null;
  readAt: string | null;
  createdAt: string | null;
};

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/// The in-app channel, on the website.
///
/// Polled rather than pushed: the whole notification volume here is a handful
/// of dues notices a term, and a websocket for that would be more moving parts
/// than the feature is worth. Opening the panel marks everything read, because
/// a badge that survives you reading the thing is just noise.
export default function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const payload = await res.json();
      setItems(payload.notifications ?? []);
      setUnread(payload.unreadCount ?? 0);
    } catch {
      // A bell that can't load is not worth an error state in the navbar.
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 120_000);
    return () => clearInterval(timer);
  }, [load]);

  // Outside-click / Escape / focus handling comes from Radix Popover.
  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      try {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        load();
      } catch {
        /* the panel is open either way */
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative h-9 w-9 min-h-9 min-w-9 shrink-0 p-0"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      {/* Portalled out of the navbar, so it uses the page's popover tokens
       * rather than the dark-bar token overrides. */}
      <PopoverContent
        align="end"
        className="max-h-[420px] w-[340px] overflow-y-auto p-0"
      >
        <div className="sticky top-0 border-b border-border bg-popover px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notifications
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing yet.
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {items.map((item) => (
              <li
                key={item._id}
                className="border-b border-border last:border-b-0"
              >
                <Link
                  href={item.link || "/member/dues"}
                  className={cn(
                    "block px-3 py-2.5 no-underline transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                    !item.readAt && "bg-primary/5"
                  )}
                  onClick={() => setOpen(false)}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-popover-foreground">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {item.body}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

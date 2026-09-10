"use client";

import { Paperclip, Search, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner } from "../../../components/LoadingState";
import { relativeTime, senderLabel } from "./format";
import type { MailListItem } from "./types";

export default function MailList({
  title,
  items,
  loading,
  selectedId,
  onSelect,
  unreadOnly,
  onUnreadOnly,
  query,
  onQuery,
  hasMore,
  onLoadMore,
  header,
}: {
  title: string;
  items: MailListItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (item: MailListItem) => void;
  unreadOnly: boolean;
  onUnreadOnly: (value: boolean) => void;
  query: string;
  onQuery: (value: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  header?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-2 px-4">
        {header}
        <h1 className="m-0 text-xl font-bold text-foreground">{title}</h1>
        <Tabs value={unreadOnly ? "unread" : "all"} onValueChange={(v) => onUnreadOnly(v === "unread")} className="ml-auto">
          <TabsList>
            <TabsTrigger value="all">All mail</TabsTrigger>
            <TabsTrigger value="unread">Unread</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="border-t" />
      <div className="shrink-0 p-4">
        {/* One frame: the wrapper owns the border and focus ring, the field
            inside is bare, and clicking the icon focuses it too. */}
        <label className="flex h-10 cursor-text items-center gap-2 overflow-hidden rounded-md border border-input bg-background px-3 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search"
            className="h-full min-w-0 flex-1 appearance-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Search mail"
          />
        </label>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 px-4 pb-4">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent",
                selectedId === item.id && "bg-muted"
              )}
            >
              <div className="flex w-full flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("truncate", !item.read ? "font-semibold" : "font-medium")}>
                      {senderLabel(item)}
                    </span>
                    {!item.read && <span className="flex size-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />}
                  </div>
                  <div className={cn("ml-auto shrink-0 text-xs", selectedId === item.id ? "text-foreground" : "text-muted-foreground")}>
                    {relativeTime(item.date)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="truncate">{item.subject}</span>
                  {item.hasAttachments && <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label="Has attachments" />}
                  {item.starred && <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" aria-label="Starred" />}
                </div>
              </div>
              {item.snippet && <div className="line-clamp-2 text-xs text-muted-foreground">{item.snippet}</div>}
              {(item.labels.length > 0 || ["bounced", "failed", "complained"].includes(item.deliveryStatus)) && (
                <div className="flex items-center gap-2">
                  {["bounced", "failed", "complained"].includes(item.deliveryStatus) && (
                    <Badge variant="destructive">Not delivered</Badge>
                  )}
                  {item.labels.map((label) => (
                    <Badge key={label} variant="secondary">
                      {label}
                    </Badge>
                  ))}
                </div>
              )}
            </button>
          ))}

          {loading && (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="sm" />
            </div>
          )}
          {!loading && items.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {query ? "No messages match your search." : unreadOnly ? "No unread messages." : "Nothing here."}
            </p>
          )}
          {!loading && hasMore && (
            <Button variant="ghost" size="sm" onClick={onLoadMore}>
              Load more
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

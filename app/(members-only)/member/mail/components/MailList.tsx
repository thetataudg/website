"use client";

import { Archive, ArchiveX, ChevronLeft, ChevronRight, FolderInput, Forward, Inbox, MailOpen, Paperclip, Search, Star, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner } from "../../../components/LoadingState";
import { relativeTime, senderLabel } from "./format";
import { labelColor } from "./labelColors";
import { labelIcon } from "./labelIcons";
import type { BulkMailAction, MailLabel, MailListItem } from "./types";

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
  page,
  pageSize,
  total,
  hasNext,
  hasPrevious,
  onNextPage,
  onPreviousPage,
  header,
  labels = [],
  hideLabelId,
  showFolder = false,
  selectedIds,
  onToggleSelected,
  onSelectAll,
  onToggleStar,
  onBulkAction,
  onBulkForward,
  bulkBusy = false,
}: {
  labels?: MailLabel[];
  /// The label being viewed: every row has it, so it isn't repeated.
  hideLabelId?: string;
  /// All Mail and label views mix folders, so say where each one is.
  showFolder?: boolean;
  title: string;
  items: MailListItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (item: MailListItem) => void;
  unreadOnly: boolean;
  onUnreadOnly: (value: boolean) => void;
  query: string;
  onQuery: (value: string) => void;
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  hasPrevious: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  header?: React.ReactNode;
  selectedIds: Set<string>;
  onToggleSelected: (id: string, selected: boolean) => void;
  onSelectAll: (ids: string[], selected: boolean) => void;
  onToggleStar: (item: MailListItem) => void;
  onBulkAction: (action: BulkMailAction) => void;
  onBulkForward: () => void;
  bulkBusy?: boolean;
}) {
  const visibleIds = items.map((item) => item.id);
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;
  const allRead = selectedItems.length > 0 && selectedItems.every((item) => item.read);
  const allStarred = selectedItems.length > 0 && selectedItems.every((item) => item.starred);
  const permanentDelete = selectedItems.length > 0 && selectedItems.every((item) => ["trash", "drafts"].includes(item.folder));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-2 px-3">
        {header}
        <Checkbox
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={(checked) => onSelectAll(visibleIds, checked === true)}
          aria-label={allSelected ? "Clear selection" : "Select all visible messages"}
          disabled={!visibleIds.length || bulkBusy}
        />
        {someSelected ? (
          <>
            <span className="min-w-16 text-sm font-medium tabular-nums">{selectedIds.size} selected</span>
            <div className="ml-auto flex items-center gap-0.5">
              <BulkButton label="Archive" icon={Archive} disabled={bulkBusy} onClick={() => onBulkAction("archive")} />
              <BulkButton label="Report junk" icon={ArchiveX} disabled={bulkBusy} onClick={() => onBulkAction("junk")} />
              <BulkButton
                label={permanentDelete ? "Delete forever" : "Move to trash"}
                icon={Trash2}
                disabled={bulkBusy}
                onClick={() => onBulkAction("delete")}
              />
              <BulkButton
                label={allRead ? "Mark as unread" : "Mark as read"}
                icon={MailOpen}
                disabled={bulkBusy}
                onClick={() => onBulkAction(allRead ? "unread" : "read")}
              />
              <BulkButton
                label={allStarred ? "Remove stars" : "Star selected"}
                icon={Star}
                disabled={bulkBusy}
                onClick={() => onBulkAction(allStarred ? "unstar" : "star")}
              />
              <BulkButton label="Forward selected" icon={Forward} disabled={bulkBusy} onClick={onBulkForward} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={bulkBusy}
                    aria-label="Move selected"
                    title="Move selected"
                  >
                    <FolderInput className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onBulkAction("inbox")}><Inbox /> Inbox</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onBulkAction("archive")}><Archive /> Archive</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onBulkAction("junk")}><ArchiveX /> Junk</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onBulkAction("trash")}><Trash2 /> Trash</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        ) : (
          <>
            <h1 className="m-0 text-xl font-bold text-foreground">{title}</h1>
            <Tabs value={unreadOnly ? "unread" : "all"} onValueChange={(v) => onUnreadOnly(v === "unread")} className="ml-auto">
              <TabsList>
                <TabsTrigger value="all">All mail</TabsTrigger>
                <TabsTrigger value="unread">Unread</TabsTrigger>
              </TabsList>
            </Tabs>
          </>
        )}
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
          {items.map((item) => {
            const rowLabels = item.labels
              .filter((id) => id !== hideLabelId)
              .map((id) => labels.find((l) => l.id === id))
              .filter((l): l is MailLabel => Boolean(l));
            const where =
              showFolder && ["archive", "sent", "junk", "trash"].includes(item.folder)
                ? { archive: "Archived", sent: "Sent", junk: "Junk", trash: "Trash" }[item.folder as "archive"]
                : showFolder && item.folder === "inbox"
                  ? "Inbox"
                  : "";
            const checked = selectedIds.has(item.id);
            return (
            <div
              key={item.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border p-3 text-sm transition-all hover:bg-accent",
                selectedId === item.id && "bg-muted",
                checked && "border-primary/30 bg-primary/5"
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(value) => onToggleSelected(item.id, value === true)}
                aria-label={`Select ${item.subject}`}
                className="mt-0.5"
                disabled={bulkBusy}
              />
              <button
                type="button"
                onClick={() => onToggleStar(item)}
                className="mt-0.5 rounded-sm text-muted-foreground hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={item.starred ? `Remove star from ${item.subject}` : `Star ${item.subject}`}
                aria-pressed={item.starred}
                disabled={bulkBusy}
              >
                <Star className={cn("size-4", item.starred && "fill-amber-400 text-amber-400")} />
              </button>
              <button type="button" onClick={() => onSelect(item)} className="min-w-0 flex-1 text-left">
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
                </div>
              </div>
              {item.snippet && <div className="line-clamp-2 text-xs text-muted-foreground">{item.snippet}</div>}
              {(rowLabels.length > 0 || where || ["bounced", "failed", "complained"].includes(item.deliveryStatus)) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {["bounced", "failed", "complained"].includes(item.deliveryStatus) && (
                    <Badge variant="destructive">Not delivered</Badge>
                  )}
                  {where && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{where}</span>
                  )}
                  {rowLabels.map((label) => (
                    <span key={label.id} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium", labelColor(label.color).chip)}>
                      {(() => {
                        const Icon = labelIcon(label.icon);
                        return <Icon className="size-3" aria-hidden="true" />;
                      })()}
                      {label.name}
                    </span>
                  ))}
                </div>
              )}
              </button>
            </div>
            );
          })}

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
        </div>
      </ScrollArea>
      <div className="flex h-11 shrink-0 items-center justify-end gap-1 border-t px-3">
        <span className="mr-2 text-xs tabular-nums text-muted-foreground">
          {total === 0 ? "0" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}`} of {total}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onPreviousPage}
          disabled={loading || !hasPrevious}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onNextPage}
          disabled={loading || !hasNext}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function BulkButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Archive;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" size="icon" className="size-8" disabled={disabled} onClick={onClick} aria-label={label} title={label}>
      <Icon className="size-4" />
    </Button>
  );
}

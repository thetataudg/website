"use client";

import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArchiveX,
  ArrowLeft,
  EllipsisVertical,
  Filter,
  Forward,
  Inbox,
  MailOpen,
  Maximize2,
  Minimize2,
  Paperclip,
  Plus,
  Reply,
  ReplyAll,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LoadingSpinner } from "../../../components/LoadingState";
import MessageBody from "./MessageBody";
import AddressMenu from "./AddressMenu";
import MailPersonAvatar from "./MailPersonAvatar";
import { fileSize, fullDate } from "./format";
import { labelColor } from "./labelColors";
import { labelIcon } from "./labelIcons";
import type { AddressActions, MailDetail, MailLabel, MailPeople } from "./types";

export type MailAction = "archive" | "junk" | "trash" | "inbox" | "unread" | "star" | "delete";

export default function MailDisplay({
  message,
  thread,
  loading,
  onAction,
  onReply,
  onReplyAll,
  onForward,
  onBack,
  labels,
  onToggleLabel,
  onNewLabel,
  onFilterLike,
  focused = false,
  onToggleFocus,
  people = {},
  addressActions,
  ownAddress,
}: {
  people?: MailPeople;
  addressActions: AddressActions;
  ownAddress: string;
  message: MailDetail | null;
  thread: MailDetail[];
  loading: boolean;
  onAction: (action: MailAction) => void;
  onReply: (m: MailDetail) => void;
  onReplyAll: (m: MailDetail) => void;
  onForward: (m: MailDetail) => void;
  onBack?: () => void;
  labels: MailLabel[];
  onToggleLabel: (labelId: string, on: boolean) => void;
  onNewLabel: () => void;
  onFilterLike: (m: MailDetail) => void;
  focused?: boolean;
  onToggleFocus?: () => void;
}) {
  const disabled = !message;
  const latest = thread.length ? thread[thread.length - 1] : message;
  const applied = new Set(message?.labels ?? []);
  const shownLabels = labels.filter((l) => applied.has(l.id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-1 px-2">
        {onBack && <ToolButton label="Back" icon={ArrowLeft} onClick={onBack} />}
        {message && <FolderActions folder={message.folder} direction={message.direction} onAction={onAction} />}
        {message && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Label as">
                    <Tag className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Label as</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Label as</DropdownMenuLabel>
              {labels.map((l) => (
                <DropdownMenuCheckboxItem
                  key={l.id}
                  checked={applied.has(l.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(on) => onToggleLabel(l.id, on === true)}
                >
                  {(() => {
                    const Icon = labelIcon(l.icon);
                    return <Icon className={cn("mr-2 size-4 shrink-0", labelColor(l.color).text)} />;
                  })()}
                  <span className="truncate">{l.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
              {labels.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={onNewLabel}>
                <Plus className="size-4" /> Create new
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="ml-auto flex items-center gap-1">
          {onToggleFocus && (
            <ToolButton
              label={focused ? "Restore mail layout" : "Open email full page"}
              icon={focused ? Minimize2 : Maximize2}
              onClick={onToggleFocus}
            />
          )}
          <ToolButton label="Reply" icon={Reply} disabled={!latest} onClick={() => latest && onReply(latest)} />
          <ToolButton label="Reply all" icon={ReplyAll} disabled={!latest} onClick={() => latest && onReplyAll(latest)} />
          <ToolButton label="Forward" icon={Forward} disabled={!latest} onClick={() => latest && onForward(latest)} />
        </div>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={disabled} aria-label="More">
              <EllipsisVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAction("unread")}>
              <MailOpen className="size-4" /> Mark as unread
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction("star")}>
              <Star className="size-4" /> {message?.starred ? "Remove star" : "Star"}
            </DropdownMenuItem>
            {message && message.folder !== "inbox" && message.direction === "in" && (
              <DropdownMenuItem onClick={() => onAction("inbox")}>
                <Inbox className="size-4" /> Move to inbox
              </DropdownMenuItem>
            )}
            {message && (
              <DropdownMenuItem onClick={() => onFilterLike(message)}>
                <Filter className="size-4" /> Filter messages like these
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Separator />

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : message ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className={cn("px-4 pb-2 pt-4", focused && "mx-auto w-full max-w-5xl px-6")}>
            <h2 className="m-0 text-lg font-semibold leading-snug text-foreground">{message.subject}</h2>
            {shownLabels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {shownLabels.map((l) => (
                  <span
                    key={l.id}
                    className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium", labelColor(l.color).chip)}
                  >
                    {(() => {
                      const Icon = labelIcon(l.icon);
                      return <Icon className="size-3" aria-hidden="true" />;
                    })()}
                    {l.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className={cn("flex flex-col", focused && "mx-auto w-full max-w-5xl")}>
            {(thread.length ? thread : [message]).map((m, i, all) => (
              <ThreadMessage
                key={m.id}
                message={m}
                defaultOpen={i === all.length - 1 || m.id === message.id}
                people={people}
                addressActions={addressActions}
                ownAddress={ownAddress}
              />
            ))}
          </div>
          {latest && (
            <div className={cn("flex gap-2 p-4", focused && "mx-auto w-full max-w-5xl px-6")}>
              <Button variant="outline" size="sm" onClick={() => onReply(latest)}>
                <Reply className="size-4" /> Reply
              </Button>
              <Button variant="outline" size="sm" onClick={() => onForward(latest)}>
                <Forward className="size-4" /> Forward
              </Button>
            </div>
          )}
        </ScrollArea>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
          No message selected
        </div>
      )}
    </div>
  );
}

function ThreadMessage({
  message,
  defaultOpen,
  people,
  addressActions,
  ownAddress,
}: {
  message: MailDetail;
  defaultOpen: boolean;
  people: MailPeople;
  addressActions: AddressActions;
  ownAddress: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sender = people[message.from.toLowerCase()];
  const name = sender?.name || message.fromName || message.from;
  const files = message.attachments.filter((a) => !a.inline);

  const addresses = (label: string, list: string[], field: "from" | "to") =>
    list.length > 0 && (
      <div className="flex flex-wrap items-baseline gap-x-1 text-xs">
        <span className="font-medium">{label}:</span>
        {list.map((address, i) => (
          <span key={`${address}-${i}`}>
            <AddressMenu
              address={address}
              people={people}
              actions={addressActions}
              ownAddress={ownAddress}
              field={field}
            />
            {i < list.length - 1 && ","}
          </span>
        ))}
      </div>
    );

  return (
    <div className="border-t">
      {/* Not a <button>: the addresses inside are buttons of their own. The
          outline only shows for keyboard focus, not after a click. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="flex w-full cursor-pointer items-start gap-4 p-4 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-expanded={open}
      >
        <MailPersonAvatar from={message.from} fromName={message.fromName} to={message.to} people={people} />
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="font-semibold">{name}</div>
          {open ? (
            <>
              {addresses("From", [message.from], "from")}
              {addresses("To", message.to, "to")}
              {addresses("Cc", message.cc, "to")}
              {addresses("Bcc", message.bcc, "to")}
              {message.replyTo.length > 0 &&
                message.replyTo[0] !== message.from &&
                addresses("Reply-To", message.replyTo, "from")}
            </>
          ) : (
            <div className="line-clamp-1 text-xs text-muted-foreground">{message.snippet}</div>
          )}
        </div>
        <div className="ml-auto shrink-0 text-right text-xs text-muted-foreground">
          <div>{fullDate(message.date)}</div>
          {message.direction === "out" && message.deliveryStatus !== "draft" && (
            <div className={cn("mt-1 capitalize", ["bounced", "failed", "complained"].includes(message.deliveryStatus) && "text-destructive")}>
              {message.deliveryStatus === "complained" ? "Marked as spam" : message.deliveryStatus}
            </div>
          )}
        </div>
      </div>
      {open && (
        <div className="space-y-4 px-4 pb-4">
          <MessageBody
            html={message.html}
            text={message.text}
            inlineImageUrls={message.inlineImageUrls}
            // Your own mail, and mail from a chapter member, isn't a stranger's
            // tracking pixel: its pictures load without asking.
            trustImages={message.direction === "out" || Boolean(sender)}
          />
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((a) => (
                <a
                  key={a.index}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex max-w-full items-center gap-2 rounded-md border px-3 py-2 text-xs hover:bg-accent",
                    a.state === "failed" && "pointer-events-none opacity-50"
                  )}
                >
                  <Paperclip className="size-3.5 shrink-0" />
                  <span className="truncate font-medium">{a.filename}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {a.state === "failed" ? "Unavailable" : fileSize(a.size)}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/// The actions Gmail offers depend on where the message is: nothing is ever
/// stuck in Archive, Junk or Trash without a way back.
function FolderActions({
  folder,
  direction,
  onAction,
}: {
  folder: MailDetail["folder"];
  direction: MailDetail["direction"];
  onAction: (action: MailAction) => void;
}) {
  const back = (label: string, icon: typeof Archive) => (
    <ToolButton label={label} icon={icon} onClick={() => onAction("inbox")} />
  );
  const archive = <ToolButton label="Archive" icon={Archive} onClick={() => onAction("archive")} />;
  const junk = <ToolButton label="Report junk" icon={ArchiveX} onClick={() => onAction("junk")} />;
  const trash = <ToolButton label="Move to trash" icon={Trash2} onClick={() => onAction("trash")} />;
  const forever = <ToolButton label="Delete forever" icon={Trash2} onClick={() => onAction("delete")} />;
  // What you sent lives in Sent; archiving or junking it would mean nothing.
  const sent = direction === "out";

  switch (folder) {
    case "archive":
      return <>{back(sent ? "Move to Sent" : "Move to inbox", ArchiveRestore)}{!sent && junk}{trash}</>;
    case "junk":
      return <>{back(sent ? "Move to Sent" : "Not junk", ShieldCheck)}{forever}</>;
    case "trash":
      return <>{back(sent ? "Restore to Sent" : "Restore to inbox", Undo2)}{forever}</>;
    case "sent":
      return <>{trash}</>;
    default:
      return <>{archive}{junk}{trash}</>;
  }
}

function ToolButton({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: typeof Archive;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" disabled={disabled} onClick={onClick} aria-label={label}>
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

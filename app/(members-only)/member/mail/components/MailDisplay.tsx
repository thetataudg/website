"use client";

import { useState } from "react";
import {
  Archive,
  ArchiveX,
  ArrowLeft,
  EllipsisVertical,
  Forward,
  Inbox,
  MailOpen,
  Paperclip,
  Reply,
  ReplyAll,
  Star,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LoadingSpinner } from "../../../components/LoadingState";
import MessageBody from "./MessageBody";
import { fileSize, fullDate, initials } from "./format";
import type { MailDetail } from "./types";

type Action = "archive" | "junk" | "trash" | "inbox" | "unread" | "star" | "delete";

export default function MailDisplay({
  message,
  thread,
  loading,
  onAction,
  onReply,
  onReplyAll,
  onForward,
  onBack,
}: {
  message: MailDetail | null;
  thread: MailDetail[];
  loading: boolean;
  onAction: (action: Action) => void;
  onReply: (m: MailDetail) => void;
  onReplyAll: (m: MailDetail) => void;
  onForward: (m: MailDetail) => void;
  onBack?: () => void;
}) {
  const disabled = !message;
  const inTrash = message?.folder === "trash";
  const latest = thread.length ? thread[thread.length - 1] : message;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-1 px-2">
        {onBack && <ToolButton label="Back" icon={ArrowLeft} onClick={onBack} />}
        <ToolButton label="Archive" icon={Archive} disabled={disabled} onClick={() => onAction("archive")} />
        <ToolButton label="Move to junk" icon={ArchiveX} disabled={disabled} onClick={() => onAction("junk")} />
        <ToolButton
          label={inTrash ? "Delete forever" : "Move to trash"}
          icon={Trash2}
          disabled={disabled}
          onClick={() => onAction(inTrash ? "delete" : "trash")}
        />
        <div className="ml-auto flex items-center gap-1">
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
          <div className="px-4 pb-2 pt-4">
            <h2 className="m-0 text-lg font-semibold leading-snug text-foreground">{message.subject}</h2>
          </div>
          <div className="flex flex-col">
            {(thread.length ? thread : [message]).map((m, i, all) => (
              <ThreadMessage key={m.id} message={m} defaultOpen={i === all.length - 1 || m.id === message.id} />
            ))}
          </div>
          {latest && (
            <div className="flex gap-2 p-4">
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

function ThreadMessage({ message, defaultOpen }: { message: MailDetail; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const name = message.fromName || message.from;
  const files = message.attachments.filter((a) => !a.inline);

  return (
    <div className="border-t">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-4 p-4 text-left text-sm"
        aria-expanded={open}
      >
        <Avatar>
          <AvatarFallback>{initials(message.fromName, message.from)}</AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="font-semibold">{name}</div>
          {open ? (
            <>
              <div className="line-clamp-1 text-xs">
                <span className="font-medium">From:</span> {message.from}
              </div>
              <div className="line-clamp-1 text-xs">
                <span className="font-medium">To:</span> {message.to.join(", ")}
              </div>
              {message.cc.length > 0 && (
                <div className="line-clamp-1 text-xs">
                  <span className="font-medium">Cc:</span> {message.cc.join(", ")}
                </div>
              )}
              {message.bcc.length > 0 && (
                <div className="line-clamp-1 text-xs">
                  <span className="font-medium">Bcc:</span> {message.bcc.join(", ")}
                </div>
              )}
              {message.replyTo.length > 0 && message.replyTo[0] !== message.from && (
                <div className="line-clamp-1 text-xs">
                  <span className="font-medium">Reply-To:</span> {message.replyTo.join(", ")}
                </div>
              )}
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
      </button>
      {open && (
        <div className="space-y-4 px-4 pb-4">
          <MessageBody html={message.html} text={message.text} inlineImageUrls={message.inlineImageUrls} />
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

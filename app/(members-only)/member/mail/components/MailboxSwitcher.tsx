"use client";

import { Check, ChevronsUpDown, User, UserPlus, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CopyAddress from "./CopyAddress";
import type { MailAccount, MailboxSummary } from "./types";

/// The address at the top of the sidebar, and beside it the list of every
/// mailbox this member can open: their own, and one per committee they head.
export default function MailboxSwitcher({
  current,
  mailboxes,
  onSwitch,
  onRequestPersonal,
  personalStatus,
  compact = false,
}: {
  current: { id: string; address: string };
  mailboxes: MailboxSummary[];
  onSwitch: (id: string) => void;
  /// Offered when they only have committee mailboxes and no address of their own.
  onRequestPersonal?: () => void;
  personalStatus?: MailAccount["status"];
  compact?: boolean;
}) {
  const others = mailboxes.filter((m) => m.id !== current.id);
  const unreadElsewhere = others.reduce((sum, m) => sum + m.unread, 0);
  const switchable = mailboxes.length > 1 || Boolean(onRequestPersonal);
  const personalAction = personalStatus === "pending"
    ? { title: "View personal mailbox request", detail: "Your request is under review" }
    : personalStatus === "suspended" || personalStatus === "revoked"
      ? { title: "View personal mailbox status", detail: "See the status of your personal address" }
      : { title: "Request a personal mailbox", detail: "Choose your own chapter email address" };

  const menu = switchable ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative size-8 shrink-0", compact && "size-9")}
          aria-label={unreadElsewhere ? `Switch mailbox, ${unreadElsewhere} unread in others` : "Switch mailbox"}
          title="Switch mailbox"
        >
          <ChevronsUpDown className="size-4" />
          {unreadElsewhere > 0 && (
            <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} className="w-72">
        <DropdownMenuLabel>Mailboxes</DropdownMenuLabel>
        {mailboxes.map((m) => {
          const Icon = m.kind === "role" ? Users : User;
          const active = m.id === current.id;
          return (
            <DropdownMenuItem
              key={m.id}
              onClick={() => !active && onSwitch(m.id)}
              className="flex items-center gap-3 py-2"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {m.kind === "role" ? m.committeeName ?? m.displayName : "Personal"}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{m.address}</span>
              </span>
              {m.unread > 0 && !active && (
                <span className="rounded-full bg-destructive px-1.5 text-[11px] font-semibold tabular-nums text-destructive-foreground">
                  {m.unread > 99 ? "99+" : m.unread}
                </span>
              )}
              <Check className={cn("size-4 shrink-0", active ? "opacity-100" : "opacity-0")} />
            </DropdownMenuItem>
          );
        })}
        {onRequestPersonal && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRequestPersonal} className="items-start gap-3 py-2">
              <UserPlus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{personalAction.title}</span>
                <span className="block text-xs text-muted-foreground">{personalAction.detail}</span>
              </span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  if (compact) return menu;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <CopyAddress address={current.address} />
      {menu}
    </div>
  );
}

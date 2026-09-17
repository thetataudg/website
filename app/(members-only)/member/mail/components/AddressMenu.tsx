"use client";

import { Ban, Copy, Filter, PenLine, Search } from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AddressActions, AddressField, MailPeople } from "./types";

/// An address you can click, as in Apple Mail: copy it, write to it, find
/// everything from it, or filter or block it.
export default function AddressMenu({
  address,
  people,
  actions,
  ownAddress,
  field,
}: {
  address: string;
  people: MailPeople;
  actions: AddressActions;
  ownAddress: string;
  field: AddressField;
}) {
  const person = people[address.toLowerCase()];
  const isSelf = address.toLowerCase() === ownAddress.toLowerCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="rounded px-1 -mx-1 text-left underline-offset-2 hover:bg-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        >
          {person?.name && !isSelf ? `${person.name} <${address}>` : address}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{address}</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={async () => {
            await navigator.clipboard.writeText(address).catch(() => undefined);
            toast.success("Address copied");
          }}
        >
          <Copy className="size-4" /> Copy address
        </DropdownMenuItem>
        {!isSelf && (
          <DropdownMenuItem onClick={() => actions.onCompose(address)}>
            <PenLine className="size-4" /> New email
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => actions.onSearch(address)}>
          <Search className="size-4" /> Search for mail with {person?.name?.split(" ")[0] || "this address"}
        </DropdownMenuItem>
        {!isSelf && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.onFilter(address, field)}>
              <Filter className="size-4" /> Filter messages {field === "from" ? "from" : "to"} this address
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => actions.onBlock(address)}>
              <Ban className="size-4" /> Block sender
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

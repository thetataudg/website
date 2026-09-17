"use client";

import { Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "./format";
import type { MailPeople } from "./types";

/// A sender's chapter photo when they are a member, a committee badge for a
/// committee mailbox, and initials for everyone else.
export function PersonAvatar({
  address,
  name,
  people,
  className,
}: {
  address: string;
  name?: string;
  people: MailPeople;
  className?: string;
}) {
  const person = people[address.toLowerCase()];
  return (
    <Avatar className={className}>
      {person?.photoUrl && <AvatarImage src={person.photoUrl} alt="" />}
      <AvatarFallback className={cn(person?.kind === "committee" && "bg-primary/10 text-primary")}>
        {person?.kind === "committee" ? (
          <Users className="size-[45%]" aria-hidden="true" />
        ) : (
          initials(person?.name || name || "", address)
        )}
      </AvatarFallback>
    </Avatar>
  );
}

/// Sender's avatar, with the recipient's tucked into the corner when the
/// message went between two chapter members.
export default function MailPersonAvatar({
  from,
  fromName,
  to,
  people,
}: {
  from: string;
  fromName: string;
  to: string[];
  people: MailPeople;
}) {
  const sender = people[from.toLowerCase()];
  const recipients = to.map((a) => a.toLowerCase()).filter((a) => a !== from.toLowerCase());
  const other = sender && recipients.length === 1 && people[recipients[0]] ? recipients[0] : null;

  return (
    <span className="relative shrink-0">
      <PersonAvatar address={from} name={fromName} people={people} />
      {other && (
        <PersonAvatar
          address={other}
          people={people}
          className="absolute -bottom-1 -right-1 size-5 text-[9px] ring-2 ring-background"
        />
      )}
    </span>
  );
}

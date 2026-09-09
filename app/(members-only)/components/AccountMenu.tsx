"use client";

// The account menu in the navbar.
//
// Replaces Clerk's `<UserButton />`, which rendered its own popover with a
// "Secured by Clerk" footer (and, on the development instance, an orange
// "Development mode" banner) inside the chapter's own navigation. The two
// entries members actually use — manage account, sign out — are kept; only the
// surface around them is ours.
//
// "Manage account" opens the chapter's own account dialog rather than Clerk's
// `openUserProfile()`, which carried the same footer one level deeper.

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { LogOut, Settings } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import AccountDialog from "./account/AccountDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/// Two letters from whatever the account actually has a name in. Falls back
/// through username and email so the circle is never blank — an empty avatar
/// reads as a broken image rather than as a person.
function initialsFor(
  firstName?: string | null,
  lastName?: string | null,
  username?: string | null,
  email?: string | null
): string {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (first || last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
  }
  const fallback = (username || email || "").trim();
  return fallback.slice(0, 2).toUpperCase() || "?";
}

export default function AccountMenu() {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [accountOpen, setAccountOpen] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = initialsFor(
    user?.firstName,
    user?.lastName,
    user?.username,
    email
  );
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.username ||
    email ||
    "Your account";
  // Username when there is one, email otherwise: the second line exists to
  // tell two accounts apart, and repeating the display name does not.
  const secondary = user?.username || email;

  // Rendered even before Clerk resolves, so the navbar does not reflow when
  // the session loads. Disabled rather than absent — a control that appears
  // late is worse than one that is briefly inert.
  if (!isLoaded) {
    return (
      <Avatar className="size-8 opacity-60">
        <AvatarFallback className="bg-primary text-xs text-primary-foreground">
          &nbsp;
        </AvatarFallback>
      </Avatar>
    );
  }

  if (!user) return null;

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full p-0 transition-transform duration-200 hover:scale-105 active:scale-95"
          aria-label="Account menu"
        >
          <Avatar className="size-8">
            {user.imageUrl ? (
              <AvatarImage src={user.imageUrl} alt="" />
            ) : null}
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="size-9 shrink-0">
            {user.imageUrl ? (
              <AvatarImage src={user.imageUrl} alt="" />
            ) : null}
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-medium text-foreground">
              {displayName}
            </p>
            {secondary ? (
              <p className="m-0 truncate text-xs text-muted-foreground">
                {secondary}
              </p>
            ) : null}
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => setAccountOpen(true)}>
          <Settings className="mr-2 size-4" aria-hidden="true" />
          Manage account
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={() => signOut({ redirectUrl: "/sign-in?logout=manual" })}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 size-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <AccountDialog
      open={accountOpen}
      onOpenChange={setAccountOpen}
      initials={initials}
    />
    </>
  );
}

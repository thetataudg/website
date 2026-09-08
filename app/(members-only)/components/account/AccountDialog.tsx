"use client";

// The chapter's own account screen.
//
// Replaces Clerk's `openUserProfile()` modal, which carried a "Secured by
// Clerk" footer and a "Development mode" banner inside the members area. Same
// two sections members already know — Profile and Security — over the same
// Clerk user resource, so nothing about what the screen can do has changed.
//
// Errors surface once, here, rather than in each panel: there is one dialog and
// one place a member looks after something fails.

import { useState } from "react";
import { CircleAlert, ShieldCheck, UserRound } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import ProfilePanel from "./ProfilePanel";
import SecurityPanel from "./SecurityPanel";

type Section = "profile" | "security";

const SECTIONS = [
  { key: "profile" as const, label: "Profile", icon: UserRound },
  { key: "security" as const, label: "Security", icon: ShieldCheck },
];

export default function AccountDialog({
  open,
  onOpenChange,
  initials,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initials: string;
}) {
  const [section, setSection] = useState<Section>("profile");
  const [error, setError] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-3xl gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogTitle className="sr-only">Account</DialogTitle>

        {/* A fixed floor, not a fixed height: the dialog holds one size for
          * both sections and only grows when a section genuinely needs more
          * room, up to the viewport cap. Sizing purely to content made it
          * jump between Profile and Security, which reads as the window
          * resizing itself while the member is using it. */}
        <div className="grid max-h-[85vh] min-h-[30rem] sm:grid-cols-[14rem_minmax(0,1fr)]">
          {/* Rail. Horizontal on a phone, where a 14rem column would leave the
            * panel too narrow to edit anything in. */}
          <div className="border-b border-border bg-muted/40 px-4 py-5 sm:border-b-0 sm:border-r sm:px-5 sm:py-6">
            <p className="m-0 text-lg font-semibold text-foreground">Account</p>
            <p className="m-0 mt-0.5 text-xs text-muted-foreground">
              Manage your account info.
            </p>

            <nav className="mt-4 flex gap-1 sm:mt-6 sm:flex-col">
              {SECTIONS.map(({ key, label, icon: Icon }) => (
                <Button
                  key={key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSection(key);
                    setError("");
                  }}
                  className={cn(
                    "justify-start gap-2 transition-colors",
                    section === key
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground"
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                </Button>
              ))}
            </nav>
          </div>

          <div className="overflow-y-auto px-5 py-6 sm:px-7">
            {error ? (
              <Alert variant="destructive" className="mb-4">
                <CircleAlert className="size-4" aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {section === "profile" ? (
              <ProfilePanel initials={initials} onError={setError} />
            ) : (
              <SecurityPanel onError={setError} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

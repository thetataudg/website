"use client";

// Shown to a member an admin has just signed out.
//
// The alternative is what happened before: the session vanishes, the shell
// says "You must be logged in", and the member assumes the site is broken and
// asks an officer. Naming the cause turns a bug report into a sign-in.
//
// It does not say which admin did it. That is in the server log for anyone who
// needs to audit it, but putting a brother's name on the screen turns a
// routine security action into a personal one.

import { SignInButton } from "@clerk/nextjs";
import { ShieldAlert } from "lucide-react";

import { PageContainer } from "./shell/PageShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function SessionRevokedState({
  deviceLabel,
}: {
  deviceLabel?: string;
}) {
  return (
    <PageContainer>
      <Alert role="alert">
        <ShieldAlert aria-hidden="true" />
        <AlertTitle>An administrator signed you out</AlertTitle>
        <AlertDescription className="space-y-4">
          <p className="m-0">
            Your session{deviceLabel ? ` on ${deviceLabel}` : ""} was ended by a
            chapter administrator. Nothing is wrong with your account. Sign in
            again to pick up where you left off.
          </p>
          <SignInButton mode="redirect">
            <Button type="button">Sign in again</Button>
          </SignInButton>
        </AlertDescription>
      </Alert>
    </PageContainer>
  );
}

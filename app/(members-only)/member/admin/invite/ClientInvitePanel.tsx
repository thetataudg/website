// app/(members-only)/member/admin/invite/ClientInvitePanel.tsx
"use client";

import { useState, useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import type { Invitation } from "@clerk/clerk-sdk-node";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";

import InviteForm from "./InviteForm";
import InvitationsList from "./InvitationsList";
import LoadingState from "../../../components/LoadingState";
import { PageContainer, PageHeader } from "../../../components/shell/PageShell";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ClientInvitePanel() {
  const { isLoaded, isSignedIn } = useAuth();

  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  // initial load
  useEffect(() => {
    loadInvites();
  }, []);

  // load pending invites from our API
  async function loadInvites() {
    setLoading(true);
    const res = await fetch("/api/members/invitations");
    if (res.ok) {
      setInvites(await res.json());
    } else {
      console.error("failed to load invites");
      setInvites([]);
    }
    setLoading(false);
  }

  // revoke helper
  async function handleRevoke(id: string) {
    await fetch(`/api/members/invitations/${id}`, { method: "DELETE" });
    await loadInvites();
  }

  // on success of InviteForm
  async function handleInviteSuccess() {
    await loadInvites();
  }

  if (!isLoaded) {
    return <LoadingState message="Loading invitations..." />;
  }

  if (!isSignedIn) {
    return (
      <PageContainer>
        <Alert variant="destructive" role="alert">
          <ShieldAlert aria-hidden="true" />
          <AlertTitle>Sign-in required</AlertTitle>
          <AlertDescription>
            You must be logged in to use this function. Redirecting you to sign
            in&hellip;
          </AlertDescription>
        </Alert>
        <RedirectToSignIn />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Invite members"
        description="Send an account invitation and manage the ones already out."
      />

      <Card>
        <CardHeader>
          <CardTitle>Send an invitation</CardTitle>
          <CardDescription>
            The recipient gets a link to create their chapter account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm onSuccess={handleInviteSuccess} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>
            {loading
              ? "Loading invitations…"
              : `${invites.length} invitation${
                  invites.length === 1 ? "" : "s"
                } sent.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div
              className="space-y-3 p-6"
              role="status"
              aria-busy="true"
              aria-live="polite"
            >
              <span className="sr-only">Loading invitations…</span>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <InvitationsList invites={invites} onRevoke={handleRevoke} />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

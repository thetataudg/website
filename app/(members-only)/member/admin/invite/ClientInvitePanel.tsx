// app/(members-only)/member/admin/invite/ClientInvitePanel.tsx
"use client";

import { useState, useEffect } from "react";
import InviteForm from "./InviteForm";
import InvitationsList from "./InvitationsList";
import type { Invitation } from "@clerk/clerk-sdk-node";

export default function ClientInvitePanel() {
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

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

  // initial load
  useEffect(() => {
    loadInvites();
  }, []);

  return (
    <>
      <InviteForm onSuccess={handleInviteSuccess} />

      <hr />

      {loading ? (
        <p>Loading…</p>
      ) : (
        <InvitationsList invites={invites} onRevoke={handleRevoke} />
      )}
    </>
  );
}

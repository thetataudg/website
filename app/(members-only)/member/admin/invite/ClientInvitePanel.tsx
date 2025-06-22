// app/(members-only)/member/admin/invite/ClientInvitePanel.tsx
"use client";

import { useState, useEffect } from "react";
import InviteForm from "./InviteForm";
import InvitationsList from "./InvitationsList";
import type { Invitation } from "@clerk/clerk-sdk-node";

import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faTriangleExclamation, faHourglass } from "@fortawesome/free-solid-svg-icons";

export default function ClientInvitePanel() {

  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="container">
        <div className="alert alert-info d-flex align-items-center mt-5" role="alert">
          <FontAwesomeIcon icon={faHourglass} className="h2" />
          <h2>Loading...</h2>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
        <div className="container">
            <div className="alert alert-danger d-flex align-items-center mt-5" role="alert">
            <FontAwesomeIcon icon={faTimes} className="h2" />
            <h3>You must be logged into use this function.</h3>
            <RedirectToSignIn />
            </div>
        </div>
    );
  }

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

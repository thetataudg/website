// app/(members-only)/member/admin/invite/InvitationsList.tsx
"use client";

import type { Invitation } from "@clerk/clerk-sdk-node";

interface Props {
  invites: (Invitation & { status?: "pending" | "accepted" })[];
  onRevoke: (id: string) => void;
}

export default function InvitationsList({ invites, onRevoke }: Props) {
  if (invites.length === 0) {
    return <p>No pending invitations.</p>;
  }

  return (
    <div>
      <h2>Pending Invitations</h2>
      <ul className="list-group">
        {invites.map((inv) => (
          <li
            className="list-group-item d-flex justify-content-between align-items-center"
            key={inv.id}
          >
            <span>
              {inv.emailAddress}{" "}
              {inv.status === "accepted" ? (
                <span className="badge bg-success ms-2">Accepted</span>
              ) : (
                <span className="badge bg-secondary ms-2">Pending</span>
              )}
            </span>
            {inv.status !== "accepted" && (
              <button
                className="btn btn-sm btn-danger"
                onClick={() => onRevoke(inv.id)}
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
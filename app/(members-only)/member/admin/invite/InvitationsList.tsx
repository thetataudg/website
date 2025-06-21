// app/(members-only)/member/admin/invite/InvitationsList.tsx
"use client";

import type { Invitation } from "@clerk/clerk-sdk-node";

interface Props {
  invites: Invitation[];
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
              {inv.emailAddress} — <em>{inv.status}</em>
            </span>
            <button
              className="btn btn-sm btn-danger"
              onClick={() => onRevoke(inv.id)}
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

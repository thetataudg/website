// app/(members-only)/member/admin/invite/InviteForm.tsx
"use client";

import { useState } from "react";

type Alert = { type: "success" | "danger"; message: string } | null;

interface Props {
  onSuccess?: () => void;
}

export default function InviteForm({ onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [alert, setAlert] = useState<Alert>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);

    try {
      const res = await fetch("/api/members/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setAlert({ type: "success", message: "Invitation sent!" });
        setEmail("");
        onSuccess?.(); // ← tell parent to reload
      } else {
        const { error } = await res.json();
        setAlert({ type: "danger", message: error || "Invitation failed" });
      }
    } catch (err: any) {
      console.error(err);
      setAlert({ type: "danger", message: "Network error, please try again." });
    }
  }

  return (
    <form onSubmit={handleInvite} className="mb-4">
      <h2>Send a new invitation</h2>
      <div className="input-group">
        <input
          type="email"
          className="form-control"
          placeholder="user@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setAlert(null);
          }}
          required
        />
        <button className="btn btn-primary">Invite</button>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type} mt-3`} role="alert">
          {alert.message}
        </div>
      )}
    </form>
  );
}

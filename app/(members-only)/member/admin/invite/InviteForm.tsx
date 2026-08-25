// app/(members-only)/member/admin/invite/InviteForm.tsx
"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, Send } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "../../../components/LoadingState";

type FormAlert = { type: "success" | "danger"; message: string } | null;

interface Props {
  onSuccess?: () => void;
}

export default function InviteForm({ onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [alert, setAlert] = useState<FormAlert>(null);
  const [sending, setSending] = useState(false);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setAlert(null);
    setSending(true);

    try {
      const res = await fetch("/api/members/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setAlert({ type: "success", message: "Invitation sent." });
        setEmail("");
        onSuccess?.(); // ← tell parent to reload
      } else {
        const { error } = await res.json();
        setAlert({ type: "danger", message: error || "Invitation failed" });
      }
    } catch (err: any) {
      console.error(err);
      setAlert({ type: "danger", message: "Network error, please try again." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleInvite} className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setAlert(null);
            }}
            required
            disabled={sending}
            aria-describedby={alert ? "invite-result" : undefined}
          />
        </div>
        <Button type="submit" disabled={sending} className="shrink-0">
          {sending ? <LoadingSpinner size="sm" /> : <Send aria-hidden="true" />}
          {sending ? "Sending…" : "Send invitation"}
        </Button>
      </div>

      {/* Announced so the result is not silent for screen-reader users. */}
      <div id="invite-result" aria-live="polite">
        {alert && (
          <Alert variant={alert.type === "success" ? "success" : "destructive"}>
            {alert.type === "success" ? (
              <CircleCheck aria-hidden="true" />
            ) : (
              <CircleAlert aria-hidden="true" />
            )}
            <AlertDescription>{alert.message}</AlertDescription>
          </Alert>
        )}
      </div>
    </form>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import LoadingState from "../../components/LoadingState";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import Onboarding from "./components/Onboarding";
import MailApp from "./components/MailApp";
import type { AccountPayload } from "./components/types";

/// Chapter Mail: the request flow until the member has a mailbox, then the
/// mailbox itself. A committee head with no address of their own still gets
/// the mailbox, for their committee's address, and can ask for their own from
/// the switcher.
export default function MailPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const [data, setData] = useState<AccountPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const arrived = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mail/account", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't load Chapter Mail.");
      setData(body);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const switchMailbox = useCallback(
    async (mailboxId: string, quiet = false) => {
      const res = await fetch("/api/mail/mailbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailboxId }),
      });
      if (!res.ok && !quiet) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Couldn't open that mailbox.");
      }
      setRequesting(false);
      await load();
    },
    [load]
  );

  useEffect(() => {
    if (!isSignedIn || arrived.current) return;
    arrived.current = true;
    // A notification names the mailbox its message is in. Open that one first,
    // so the message it links to is there to find.
    const params = new URLSearchParams(window.location.search);
    const mailbox = params.get("mailbox");
    if (mailbox) {
      params.delete("mailbox");
      const rest = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    }
    if (mailbox && /^[a-f0-9]{24}$/i.test(mailbox)) void switchMailbox(mailbox, true);
    else void load();
  }, [isSignedIn, load, switchMailbox]);

  if (!isLoaded) return <LoadingState />;
  if (!isSignedIn) return <RedirectToSignIn />;

  const canOpen = Boolean(data?.mailboxes?.length) && data!.eligible;
  const hasPersonal = data?.account?.status === "active";

  return (
    <>
      <Toaster />
      {error ? (
        <p className="px-4 py-20 text-center text-sm text-muted-foreground">{error}</p>
      ) : !data ? (
        <LoadingState />
      ) : canOpen && !requesting ? (
        <MailApp
          key={data.current?.id}
          data={data}
          onSwitchMailbox={(id) => void switchMailbox(id)}
          onRequestPersonal={hasPersonal ? undefined : () => setRequesting(true)}
        />
      ) : (
        <>
          {canOpen && (
            <div className="mx-auto max-w-xl px-4 pt-6">
              <Button variant="ghost" size="sm" onClick={() => setRequesting(false)}>
                <ArrowLeft className="size-4" /> Back to mail
              </Button>
            </div>
          )}
          <Onboarding data={data} onChange={load} />
        </>
      )}
    </>
  );
}

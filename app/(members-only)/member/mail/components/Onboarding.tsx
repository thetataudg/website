"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Mail, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "../../../components/LoadingState";
import type { AccountPayload } from "./types";

type Availability = { state: "idle" | "checking" | "ok" | "error"; message?: string };

export default function Onboarding({ data, onChange }: { data: AccountPayload; onChange: () => void }) {
  const account = data.account;
  const [choosing, setChoosing] = useState(false);

  if (!data.eligible && (!account || account.status !== "suspended")) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle>Chapter Mail</CardTitle>
          <CardDescription>Chapter email addresses are available to active members and alumni.</CardDescription>
        </CardHeader>
      </Shell>
    );
  }

  if (account?.status === "suspended") {
    return (
      <Shell>
        <CardHeader>
          <CardTitle>Your mailbox is paused</CardTitle>
          <CardDescription>
            {account.address} can&apos;t send or receive mail right now. Reach out to an officer if you think this is a mistake.
          </CardDescription>
        </CardHeader>
      </Shell>
    );
  }

  if (account?.status === "pending") return <Submitted address={account.address} onChange={onChange} />;

  if (choosing) return <ChooseAddress data={data} onBack={() => setChoosing(false)} onSubmitted={onChange} />;

  if (account?.status === "rejected") {
    return (
      <Shell>
        <CardHeader>
          <CardTitle>Your request wasn&apos;t approved</CardTitle>
          <CardDescription>
            {account.reviewComments ? `Reason: ${account.reviewComments}` : `Your request for ${account.address} was not approved.`}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => setChoosing(true)}>Request a different address</Button>
        </CardFooter>
      </Shell>
    );
  }

  return (
    <Shell>
      <CardHeader className="items-start gap-4">
        <div className="rounded-lg bg-muted p-3">
          <Mail className="size-6" />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-2xl">Get your chapter email</CardTitle>
          <CardDescription className="text-base">
            A personal @{data.domain} address for recruiters, professors and chapter business. Only you can read your mail.
          </CardDescription>
        </div>
      </CardHeader>
      <CardFooter>
        <Button size="lg" onClick={() => setChoosing(true)}>
          Request an address
        </Button>
      </CardFooter>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-xl px-4 py-12 sm:py-20">
      <Card className="w-full">{children}</Card>
    </div>
  );
}

function ChooseAddress({
  data,
  onBack,
  onSubmitted,
}: {
  data: AccountPayload;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const suggestions = data.suggestions ?? [];
  const [selected, setSelected] = useState<string>(suggestions[0] ?? "custom");
  const [custom, setCustom] = useState("");
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const [submitting, setSubmitting] = useState(false);

  const localPart = selected === "custom" ? custom.trim().toLowerCase() : selected;

  // Only a typed address needs checking live; suggestions were free when the
  // page loaded, and the server checks again on submit either way.
  useEffect(() => {
    if (selected !== "custom") {
      setAvailability({ state: "ok" });
      return;
    }
    if (!custom.trim()) {
      setAvailability({ state: "idle" });
      return;
    }
    setAvailability({ state: "checking" });
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mail/availability?local=${encodeURIComponent(custom.trim())}`);
        const body = await res.json();
        setAvailability(body.available ? { state: "ok" } : { state: "error", message: body.error || "Unavailable." });
      } catch {
        setAvailability({ state: "error", message: "Couldn't check that address." });
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [custom, selected]);

  const canSubmit = useMemo(() => Boolean(localPart) && availability.state === "ok" && !submitting, [localPart, availability, submitting]);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/mail/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localPart }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Couldn't submit your request.");
        if (res.status === 409 && selected === "custom") setAvailability({ state: "error", message: body.error });
        return;
      }
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Shell>
      <CardHeader>
        <CardTitle>Choose your address</CardTitle>
        <CardDescription>Pick a suggestion or type your own.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2" role="radiogroup" aria-label="Email address">
        {suggestions.map((s) => (
          <Option key={s} checked={selected === s} onSelect={() => setSelected(s)}>
            <span className="font-medium">{s}</span>
            <span className="text-muted-foreground">@{data.domain}</span>
          </Option>
        ))}
        <Option checked={selected === "custom"} onSelect={() => setSelected("custom")}>
          <span className="font-medium">Use a custom address</span>
        </Option>
        {selected === "custom" && (
          <div className="space-y-1.5 pt-2">
            <Label htmlFor="mail-custom" className="sr-only">
              Custom address
            </Label>
            {/* One field, one border: the wrapper draws the frame and the focus
                ring, and the input inside is bare so it can't paint its own
                rounded box over the suffix. */}
            <div className="flex h-11 items-center overflow-hidden rounded-md border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
              <input
                id="mail-custom"
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/\s/g, ""))}
                placeholder="first.last"
                className="h-full min-w-0 flex-1 bg-transparent pl-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={30}
              />
              <span className="shrink-0 select-none pr-3 text-sm text-muted-foreground">@{data.domain}</span>
            </div>
            <p
              className={cn(
                "flex items-center gap-1.5 text-xs",
                availability.state === "error" ? "text-destructive" : "text-muted-foreground"
              )}
              aria-live="polite"
            >
              {availability.state === "checking" && "Checking..."}
              {availability.state === "ok" && (
                <>
                  <Check className="size-3.5 text-emerald-600" /> Available
                </>
              )}
              {availability.state === "error" && (
                <>
                  <X className="size-3.5" /> {availability.message}
                </>
              )}
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button variant="ghost" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button onClick={submit} disabled={!canSubmit}>
          {submitting && <LoadingSpinner size="sm" />}
          Request access
        </Button>
      </CardFooter>
    </Shell>
  );
}

function Option({ checked, onSelect, children }: { checked: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors",
        checked ? "border-foreground bg-accent" : "border-border hover:bg-accent/60"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-foreground" : "border-muted-foreground/50"
        )}
      >
        {checked && <span className="size-2 rounded-full bg-foreground" />}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

function Submitted({ address, onChange }: { address: string; onChange: () => void }) {
  const [cancelling, setCancelling] = useState(false);
  async function cancel() {
    setCancelling(true);
    const res = await fetch("/api/mail/account", { method: "DELETE" });
    setCancelling(false);
    if (!res.ok) {
      toast.error("Couldn't cancel your request.");
      return;
    }
    onChange();
  }
  return (
    <Shell>
      <CardHeader className="items-start gap-4">
        <div className="rounded-lg bg-muted p-3">
          <Check className="size-6" />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-2xl">Your request has been submitted</CardTitle>
          <CardDescription className="text-base">
            An officer will review your request for <span className="font-medium text-foreground">{address}</span>. You&apos;ll get an email and a notification once it&apos;s approved.
          </CardDescription>
        </div>
      </CardHeader>
      <CardFooter>
        <Button variant="outline" onClick={cancel} disabled={cancelling}>
          {cancelling && <LoadingSpinner size="sm" />}
          Cancel request
        </Button>
      </CardFooter>
    </Shell>
  );
}

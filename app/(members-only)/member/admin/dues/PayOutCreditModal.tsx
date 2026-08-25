"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";

import { LoadingSpinner } from "../../../components/LoadingState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const METHODS = [
  { value: "venmo", label: "Venmo" },
  { value: "zelle", label: "Zelle" },
  { value: "check", label: "Check" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Something else" },
];

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export default function PayOutCreditModal({
  member,
  onClose,
  onPaid,
}: {
  member: { memberId: string; rollNo: string; name: string; creditCents: number };
  onClose: () => void;
  onPaid: (message: string) => void;
}) {
  const [amount, setAmount] = useState((member.creditCents / 100).toFixed(2));
  const [method, setMethod] = useState("venmo");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round(Number(amount) * 100);
  const tooMuch = amountCents > member.creditCents;
  const invalid = !Number.isFinite(amountCents) || amountCents <= 0 || tooMuch;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/credit/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: member.memberId,
          amountCents,
          method,
          reference: reference.trim(),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't record that");
      onPaid(
        `Paid ${money(amountCents)} to ${member.name}.` +
          (payload?.creditCents > 0
            ? ` ${money(payload.creditCents)} still owed to them.`
            : "")
      );
    } catch (err: any) {
      setError(err.message || "Couldn't record that");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
    >
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-md"
        /* No backdrop dismissal while recording money. */
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Pay out credit</DialogTitle>
          <DialogDescription>
            The chapter owes <strong className="font-semibold text-foreground">{member.name}</strong>{" "}
            #{member.rollNo} {money(member.creditCents)}. Record it here once
            you&apos;ve actually sent the money. This doesn&apos;t move any
            funds.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="payout-amount">Amount</Label>
            <CurrencyInput
                id="payout-amount"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
                aria-invalid={tooMuch || undefined}
                aria-describedby={tooMuch ? "payout-amount-error" : undefined}
              />
            {tooMuch && (
              <p
                id="payout-amount-error"
                className="text-xs font-medium text-destructive"
              >
                That&apos;s more than the {money(member.creditCents)} owed.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payout-method">How did you send it?</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="payout-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payout-reference">
              Reference{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="payout-reference"
              type="text"
              placeholder="@their-venmo, check #118"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={200}
            />
          </div>

          {error && (
            <Alert variant="destructive" role="alert">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={invalid || saving}>
              {saving && <LoadingSpinner size="sm" />}
              {saving ? "Recording…" : "Record payout"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

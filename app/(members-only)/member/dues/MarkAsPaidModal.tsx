"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";

import { LoadingSpinner } from "../../components/LoadingState";
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
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PayableCharge = {
  _id: string;
  description: string;
  term: string;
  balanceCents: number;
};

const METHODS = [
  { value: "venmo", label: "Venmo" },
  { value: "zelle", label: "Zelle" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "other", label: "Something else" },
];

function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

/// Today, as the member's own calendar sees it. `toISOString()` would hand back
/// a UTC day, which is the day before for anyone west of Greenwich after 5pm.
function todayLocal() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export default function MarkAsPaidModal({
  charge,
  onClose,
  onFiled,
}: {
  charge: PayableCharge;
  onClose: () => void;
  onFiled: () => void;
}) {
  const [amount, setAmount] = useState(centsToInput(charge.balanceCents));
  const [method, setMethod] = useState("venmo");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(todayLocal());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = Math.round(Number(amount) * 100);
  const overpaying = amountCents > charge.balanceCents;
  const invalid = !Number.isFinite(amountCents) || amountCents <= 0 || overpaying;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dues/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chargeId: charge._id,
          amountCents,
          method,
          reference: reference.trim(),
          paidOn,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Couldn't file that payment");
      }
      onFiled();
    } catch (err: any) {
      setError(err.message || "Couldn't file that payment");
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
        /* No backdrop dismissal while reporting money. */
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Report a payment</DialogTitle>
          <DialogDescription>
            {charge.description} &middot; {charge.term}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="paid-amount">How much did you pay?</Label>
            <CurrencyInput
              id="paid-amount"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              aria-invalid={overpaying || undefined}
              aria-describedby={overpaying ? "paid-amount-error" : undefined}
            />
            {overpaying && (
              <p
                id="paid-amount-error"
                className="text-xs font-medium text-destructive"
              >
                That&apos;s more than the ${centsToInput(charge.balanceCents)}{" "}
                still owed on this charge.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="paid-on">When did you pay?</Label>
            <DatePicker
              id="paid-on"
              value={paidOn}
              maxDate={new Date()}
              onChange={setPaidOn}
              placeholder="Choose the day you paid"
              aria-describedby="paid-on-help"
            />
            <p id="paid-on-help" className="text-xs text-muted-foreground">
              The date the money actually left your account, not today, if you
              paid earlier. This is the date used to decide whether you paid on
              time, so it stands even if the treasurer takes a while to check it
              off.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="paid-method">How?</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="paid-method">
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
            <Label htmlFor="paid-reference">
              Anything that helps them find it{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="paid-reference"
              type="text"
              placeholder="@your-venmo, check #204, gave it to Marcus"
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
              {saving ? "Sending…" : "Send to the treasurer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

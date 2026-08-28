"use client";

import { useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { CircleAlert, LockKeyhole } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type PaymentKind = "installment" | "custom" | "full";

type IntentResponse = {
  clientSecret: string;
  publishableKey: string;
  payment: {
    _id: string;
    principalCents: number;
    feeCents: number;
    totalCents: number;
  };
};

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function CheckoutForm({
  totalCents,
  onComplete,
}: {
  totalCents: number;
  onComplete: (status: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/member/dues` },
      redirect: "if_required",
    });
    if (result.error) {
      setError(result.error.message || "The payment could not be completed");
      setSubmitting(false);
      return;
    }
    onComplete(result.paymentIntent?.status ?? "processing");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? (
        <Alert variant="destructive" role="alert">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <DialogFooter>
        <Button type="submit" className="w-full" disabled={!stripe || submitting}>
          {submitting ? "Processing…" : `Pay ${money(totalCents)}`}
        </Button>
      </DialogFooter>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <LockKeyhole aria-hidden="true" className="size-3.5" />
        Payment details are handled securely by Stripe.
      </p>
    </form>
  );
}

export default function OnlinePaymentModal({
  amountDueNowCents,
  balanceCents,
  onClose,
  onSubmitted,
}: {
  amountDueNowCents: number;
  balanceCents: number;
  onClose: () => void;
  onSubmitted: (status: string) => void;
}) {
  const [kind, setKind] = useState<PaymentKind>("installment");
  const [customAmount, setCustomAmount] = useState(
    (amountDueNowCents / 100).toFixed(2)
  );
  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customCents = Math.round(Number(customAmount) * 100);
  const chosenCents =
    kind === "full"
      ? balanceCents
      : kind === "installment"
        ? amountDueNowCents
        : customCents;
  const invalid =
    !Number.isFinite(chosenCents) || chosenCents <= 0 || chosenCents > balanceCents;
  const stripePromise = useMemo(
    () =>
      intent?.publishableKey
        ? loadStripe(intent.publishableKey, {
            developerTools: { assistant: { enabled: false } },
          })
        : null,
    [intent?.publishableKey]
  );

  async function continueToPayment() {
    if (invalid || starting) return;
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/dues/payments/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          ...(kind === "custom" ? { amountCents: customCents } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Couldn't start the payment");
      setIntent(payload as IntentResponse);
    } catch (err: any) {
      setError(err.message || "Couldn't start the payment");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !starting && onClose()}>
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-lg"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Pay dues online</DialogTitle>
          <DialogDescription>
            Use Apple Pay, a card, or a US bank account.
          </DialogDescription>
        </DialogHeader>

        {!intent ? (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">How much?</legend>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                <input
                  type="radio"
                  name="payment-kind"
                  value="installment"
                  checked={kind === "installment"}
                  onChange={() => setKind("installment")}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium">Current amount due</span>
                  <span className="text-sm text-muted-foreground">
                    {money(amountDueNowCents)}
                  </span>
                </span>
              </label>
              {balanceCents !== amountDueNowCents ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                  <input
                    type="radio"
                    name="payment-kind"
                    value="full"
                    checked={kind === "full"}
                    onChange={() => setKind("full")}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium">Full balance</span>
                    <span className="text-sm text-muted-foreground">
                      {money(balanceCents)}
                    </span>
                  </span>
                </label>
              ) : null}
              <label className="block cursor-pointer rounded-lg border p-3">
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="payment-kind"
                    value="custom"
                    checked={kind === "custom"}
                    onChange={() => setKind("custom")}
                    className="mt-1"
                  />
                  <span className="font-medium">Another amount</span>
                </span>
                {kind === "custom" ? (
                  <span className="mt-3 block space-y-1.5 pl-6">
                    <Label htmlFor="online-custom-amount">Amount</Label>
                    <CurrencyInput
                      id="online-custom-amount"
                      min="0.01"
                      max={(balanceCents / 100).toFixed(2)}
                      step="0.01"
                      value={customAmount}
                      onChange={(event) => setCustomAmount(event.target.value)}
                      aria-invalid={invalid || undefined}
                    />
                  </span>
                ) : null}
              </label>
            </fieldset>

            {error ? (
              <Alert variant="destructive" role="alert">
                <CircleAlert aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="text-lg font-semibold">{money(chosenCents || 0)}</span>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={starting}>
                Cancel
              </Button>
              <Button type="button" onClick={continueToPayment} disabled={invalid || starting}>
                {starting ? "Opening checkout…" : "Continue"}
              </Button>
            </DialogFooter>
          </div>
        ) : stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: intent.clientSecret,
              appearance: { theme: "stripe" },
            }}
          >
            <CheckoutForm totalCents={intent.payment.totalCents} onComplete={onSubmitted} />
          </Elements>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { Appearance } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { CircleAlert, LockKeyhole } from "lucide-react";

import { useTheme } from "../../components/ThemeProvider";
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
import { Textarea } from "@/components/ui/textarea";

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
  paymentId,
  totalCents,
  onComplete,
}: {
  paymentId: string;
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
    // Tell our own server before handing back, so the ledger shows the
    // payment as pending the instant the page reloads rather than whenever
    // Stripe's webhook happens to arrive. Failure here is not the member's
    // problem: the webhook still settles it, so we carry on either way.
    await fetch(`/api/dues/payments/${paymentId}`, { method: "POST" }).catch(
      () => null
    );
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

/// Stripe's own styling for the embedded payment form.
///
/// The Payment Element renders inside Stripe's iframe, so none of this app's
/// CSS reaches it: left alone it draws a white form with dark labels, which
/// inside a dark modal came out as white input boxes and labels that were
/// almost unreadable against the panel behind them.
///
/// `theme: "night"` is Stripe's dark base. The variables on top of it are the
/// members-area tokens, resolved to literals because an iframe cannot read a
/// CSS custom property from its parent document.
function appearanceFor(dark: boolean): Appearance {
  if (!dark) {
    return {
      theme: "stripe",
      variables: {
        colorPrimary: "#7a0104",
        borderRadius: "8px",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      },
    };
  }
  return {
    theme: "night",
    variables: {
      colorPrimary: "#e2ab16",
      // Matched to the dialog it sits in rather than to Stripe's default
      // near-black, so the form does not read as a panel inside a panel.
      colorBackground: "#1c1c1f",
      colorText: "#f5f5f5",
      // Stripe's night default for secondary text fails contrast on this
      // ground; the labels are the part that was unreadable.
      colorTextSecondary: "#b9b9c0",
      colorTextPlaceholder: "#8a8a93",
      colorDanger: "#e04351",
      borderRadius: "8px",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    },
    rules: {
      // The tab row is the part that stayed white: it is a separate surface
      // from the inputs and Stripe does not tint it from `colorBackground`.
      ".Tab": {
        backgroundColor: "#242427",
        borderColor: "#3a3a3f",
      },
      ".Tab--selected": {
        backgroundColor: "#2e2e32",
        borderColor: "#e2ab16",
      },
      ".Input": {
        backgroundColor: "#242427",
        borderColor: "#3a3a3f",
      },
      ".Label": {
        color: "#b9b9c0",
      },
      // The "another step will appear" panel on wallet tabs, which rendered
      // as a white block.
      ".Block": {
        backgroundColor: "#242427",
        borderColor: "#3a3a3f",
      },
    },
  };
}

export default function OnlinePaymentModal({
  amountDueNowCents,
  balanceCents,
  processingCents,
  onClose,
  onSubmitted,
}: {
  amountDueNowCents: number;
  balanceCents: number;
  processingCents: number;
  onClose: () => void;
  onSubmitted: (status: string) => void;
}) {
  const [kind, setKind] = useState<PaymentKind>(() =>
    amountDueNowCents > 0 ? "installment" : "full"
  );
  const [customAmount, setCustomAmount] = useState(
    (amountDueNowCents / 100).toFixed(2)
  );
  const [note, setNote] = useState("");
  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const { resolvedTheme } = useTheme();
  // Recomputed when the theme flips, and `Elements` forwards a changed
  // appearance to the iframe, so toggling dark mode restyles the open form
  // rather than needing it closed and reopened.
  const stripeAppearance = useMemo(
    () => appearanceFor(resolvedTheme === "dark"),
    [resolvedTheme]
  );
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
          note: note.trim(),
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
            {processingCents > 0 ? (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                {money(processingCents)} is already processing. You can submit up
                to {money(balanceCents)} more.
              </div>
            ) : null}
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">How much?</legend>
              {amountDueNowCents > 0 ? (
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
              ) : null}
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
                    <span className="block font-medium">Remaining available balance</span>
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

            <div className="space-y-1.5">
              <Label htmlFor="online-payment-note">
                Note for the treasurer{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="online-payment-note"
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, 500))}
                rows={2}
                maxLength={500}
                placeholder="Anything the treasurer should know about this payment"
              />
            </div>

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
              appearance: stripeAppearance,
            }}
          >
            <CheckoutForm
              paymentId={intent.payment._id}
              totalCents={intent.payment.totalCents}
              onComplete={onSubmitted}
            />
          </Elements>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

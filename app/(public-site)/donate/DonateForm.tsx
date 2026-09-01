"use client";

import { useMemo, useState } from "react";
import type { Appearance } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

/// Mirrors `DONATION_DESIGNATIONS` on the server and the "where your gift goes"
/// list on the page around this form. All three move together.
const DESIGNATIONS = [
  { value: "general", label: "Where it's needed most" },
  { value: "housing", label: "Housing" },
  { value: "operations", label: "Chapter operations" },
  { value: "professional", label: "Professional certifications" },
  { value: "tools", label: "Tools and equipment" },
];

const PRESETS = [2500, 5000, 15000, 30000];

function formatCents(cents: number) {
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toFixed(2)}`;
}

const appearance: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: "#e2ab16",
    colorBackground: "#180e0e",
    colorText: "#f2ece4",
    colorTextSecondary: "#9d9089",
    colorDanger: "#ff9b9b",
    borderRadius: "10px",
    spacingUnit: "3px",
    fontSizeBase: "15px",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  },
};

/// Inter is the site's body face, loaded into the Stripe iframe so the checkout
/// reads as part of the page rather than as an embedded form.
const stripeFonts = [
  {
    cssSrc:
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
  },
];

const field =
  "mt-1.5 w-full rounded-[10px] border border-white/10 bg-black/25 px-3 py-2.5 text-[15px] text-white placeholder:text-white/30 outline-none transition focus:border-[#e2ab16]/70";
const label = "block text-[13px] font-medium text-white/55";
const card =
  "rounded-2xl border border-white/10 bg-[#1a1010] p-6 sm:p-8";

type Started = {
  clientSecret: string;
  publishableKey: string;
  amountCents: number;
  designationLabel: string;
};

export default function DonateForm() {
  const [started, setStarted] = useState<Started | null>(null);
  const [done, setDone] = useState(false);

  const stripePromise = useMemo(
    () => (started ? loadStripe(started.publishableKey) : null),
    [started]
  );

  if (done && started) {
    return (
      <div className={card}>
        <h2 className="text-xl font-semibold tracking-tight text-[#e2ab16]">
          Thank you
        </h2>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/70">
          Your {formatCents(started.amountCents)} gift went through. Stripe is
          emailing your receipt, and someone from the chapter will follow up to
          thank you properly.
        </p>
        <button
          type="button"
          onClick={() => {
            setStarted(null);
            setDone(false);
          }}
          className="mt-6 text-sm font-medium text-[#e2ab16] underline underline-offset-4"
        >
          Make another gift
        </button>
      </div>
    );
  }

  return (
    <div className={card}>
      {started && stripePromise ? (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: started.clientSecret,
            appearance,
            fonts: stripeFonts,
          }}
        >
          <PaymentStep
            started={started}
            onBack={() => setStarted(null)}
            onDone={() => setDone(true)}
          />
        </Elements>
      ) : (
        <DetailsStep onStarted={setStarted} />
      )}
    </div>
  );
}

function DetailsStep({ onStarted }: { onStarted: (value: Started) => void }) {
  const [preset, setPreset] = useState<number | null>(5000);
  const [custom, setCustom] = useState("");
  const [designation, setDesignation] = useState("general");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = useMemo(() => {
    if (preset !== null) return preset;
    const value = Number(custom.replace(/[^0-9.]/g, ""));
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }, [preset, custom]);

  const canSubmit = amountCents >= 100 && !submitting;

  async function start() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/donations/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          designation,
          donorName,
          donorEmail,
          message,
          isAnonymous,
          channel: "web",
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || "Something went wrong. Please try again.");
        return;
      }
      onStarted({
        clientSecret: data.clientSecret,
        publishableKey: data.publishableKey,
        amountCents,
        designationLabel:
          DESIGNATIONS.find((option) => option.value === designation)?.label ??
          "Where it's needed most",
      });
    } catch {
      setError("We couldn't reach the payment service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h2 className="text-xl font-semibold tracking-tight">Make a gift</h2>
      <p className="mt-2 text-[15px] text-white/55">
        One-time, by card or Apple Pay.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-[10px] border border-[#b3202a]/50 bg-[#b3202a]/15 px-3 py-2.5 text-sm text-white"
        >
          {error}
        </p>
      ) : null}

      <fieldset className="mt-6">
        <legend className={label}>Amount</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setPreset(value);
                setCustom("");
              }}
              aria-pressed={preset === value}
              className={`rounded-[10px] border px-4 py-2.5 text-[15px] transition ${
                preset === value
                  ? "border-[#e2ab16] bg-[#e2ab16]/12 text-[#e2ab16]"
                  : "border-white/10 bg-black/25 text-white/85 hover:border-white/25"
              }`}
            >
              {formatCents(value)}
            </button>
          ))}
          <input
            aria-label="Another amount in dollars"
            inputMode="decimal"
            placeholder="Other"
            value={custom}
            onChange={(event) => {
              setCustom(event.target.value);
              setPreset(null);
            }}
            className={`${field} mt-0 w-24`}
          />
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Where it goes
          <select
            value={designation}
            onChange={(event) => setDesignation(event.target.value)}
            className={field}
          >
            {DESIGNATIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={label}>
          Name
          <input
            className={field}
            placeholder="Your name"
            value={donorName}
            onChange={(event) => setDonorName(event.target.value)}
            autoComplete="name"
          />
        </label>

        <label className={label}>
          Email
          <input
            className={field}
            placeholder="name@email.com"
            type="email"
            value={donorEmail}
            onChange={(event) => setDonorEmail(event.target.value)}
            autoComplete="email"
          />
          <span className="mt-1 block text-xs font-normal text-white/35">
            Where your receipt goes.
          </span>
        </label>

        <label className={label}>
          Message
          <input
            className={field}
            placeholder="Optional"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={500}
          />
        </label>
      </div>

      <label className="mt-5 flex items-start gap-2.5 text-sm text-white/60">
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(event) => setIsAnonymous(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#e2ab16]"
        />
        <span>
          Do not name me publicly. The chapter still keeps your name on its own
          records.
        </span>
      </label>

      <button
        type="button"
        onClick={start}
        disabled={!canSubmit}
        className="tt-button-primary tt-button-plain mt-6 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {submitting
          ? "Starting"
          : `Continue${amountCents >= 100 ? ` · ${formatCents(amountCents)}` : ""}`}
      </button>

      <p className="mt-5 text-xs leading-relaxed text-white/35">
        Gifts go to Theta Tau Delta Gamma. The chapter is not a registered
        charity, so a gift is not tax deductible.
      </p>
    </>
  );
}

function PaymentStep({
  started,
  onBack,
  onDone,
}: {
  started: Started;
  onBack: () => void;
  onDone: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message || "That payment did not go through.");
      setSubmitting(false);
      return;
    }

    const status = result.paymentIntent?.status;
    if (status === "succeeded" || status === "processing") {
      // The webhook records the gift. This screen only has to be honest about
      // what the donor just did.
      onDone();
      return;
    }
    setError("That payment did not complete. Please try another card.");
    setSubmitting(false);
  }

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {formatCents(started.amountCents)}
          </h2>
          <p className="mt-1 text-sm text-white/50">
            {started.designationLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="text-sm font-medium text-white/50 underline underline-offset-4 transition hover:text-white/80 disabled:opacity-40"
        >
          Edit
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-[10px] border border-[#b3202a]/50 bg-[#b3202a]/15 px-3 py-2.5 text-sm text-white"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      <button
        type="button"
        onClick={pay}
        disabled={!stripe || submitting}
        className="tt-button-primary tt-button-plain mt-6 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {submitting ? "Processing" : `Give ${formatCents(started.amountCents)}`}
      </button>

      <p className="mt-4 text-xs text-white/35">
        Handled by Stripe. The chapter never sees your card number.
      </p>
    </>
  );
}

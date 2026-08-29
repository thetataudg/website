import Stripe from "stripe";

let client: Stripe | null = null;

export function onlineDuesPaymentsEnabled() {
  // Local development is allowed through the complete Stripe flow even when
  // the chapter switch is off. Preview deployments can opt in explicitly;
  // ordinary production builds still require the chapter setting.
  return (
    process.env.ONLINE_DUES_PAYMENTS_ENABLED === "true" ||
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_FORCE_ONLINE_PAYMENTS === "true"
  );
}

export function stripeIsConfigured() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY
  );
}

export function getStripe() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe is not configured on the server");
  if (!client) {
    client = new Stripe(secret, {
      apiVersion: "2026-08-26.dahlia",
      typescript: true,
      appInfo: { name: "Theta Tau Dues" },
    });
  }
  return client;
}

export function stripePublishableKey() {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) throw new Error("Stripe publishable key is not configured");
  return key;
}

import Stripe from "stripe";

let client: Stripe | null = null;

export function onlineDuesPaymentsEnabled() {
  return process.env.ONLINE_DUES_PAYMENTS_ENABLED === "true";
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

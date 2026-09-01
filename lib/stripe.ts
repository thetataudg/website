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

/// Tap to Pay readers are not registered ahead of time; they are attached to a
/// Terminal location at connection time, and the location's `display_name` is
/// what the cardholder reads on the tap screen. No location, no in-person
/// payments — so this is checked before a connection token is ever issued.
export function terminalLocationId() {
  return process.env.STRIPE_TERMINAL_LOCATION_ID ?? "";
}

export function terminalPaymentsEnabled() {
  return (
    onlineDuesPaymentsEnabled() &&
    stripeIsConfigured() &&
    Boolean(terminalLocationId())
  );
}

/// Whether the iOS app may collect a gift natively, rather than sending the
/// donor to the website.
///
/// Its own switch, defaulting on, because this is the one part of giving that
/// carries App Review risk: guideline 3.2.2(iv) restricts in-app fundraising to
/// Apple-approved nonprofits. If review ever objects, setting
/// APP_DONATIONS_ENABLED=false makes the app fall back to opening the web page
/// immediately, with no resubmission and no wait.
export function appDonationsEnabled() {
  return donationsEnabled() && process.env.APP_DONATIONS_ENABLED !== "false";
}

/// Donations ride the same Stripe account but are switched separately, because
/// the public page is reachable without signing in and wants to be able to go
/// dark on its own.
export function donationsEnabled() {
  return (
    stripeIsConfigured() &&
    (process.env.DONATIONS_ENABLED === "true" ||
      process.env.NODE_ENV === "development")
  );
}

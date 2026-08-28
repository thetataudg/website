# Treasury — deployment and configuration

The dues/treasury feature is code-complete. Everything below is configuration:
credentials and a deploy. Nothing here requires writing code.

The design document is the authority on *why* any of this is shaped the way it
is: https://claude.ai/code/artifact/2111b533-a6f5-4057-9ace-fc0dd724d2b3

## The one thing to understand first

Both external notification channels **no-op cleanly when unconfigured.** Each
adapter has an `isConfigured()` gate, and an unconfigured channel returns
`{ delivered: false, skipped: "not configured" }` rather than throwing. The
in-app channel has no dependencies and works today, and the `FinanceEvent`
audit row is written whether or not an external channel succeeded.

So the app is deployable right now. Email and push switch themselves on the
moment their keys exist, with no code change and no redeploy logic.

## Environment variables

| Variable | Required for | Default if unset |
|---|---|---|
| `RESEND_API_KEY` | Email. Without it the email channel stays inert. | — (channel off) |
| `ALERTS_EMAIL_DOMAIN` | Sending domain | `alerts.ttdg.org` |
| `CHAPTER_REPLY_TO` | Overrides every `Reply-To` at once — use on staging so it can't mail real officers | per-category (treasurer@ / general@thetatau-dg.org) |
| `APNS_KEY_ID` | Push | — (channel off) |
| `APNS_KEY_P8` | Push — the `.p8` contents | — (channel off) |
| `APNS_TEAM_ID` | Push | `WVQ9Z7S7RR` |
| `APNS_BUNDLE_ID` | Push | `org.thetatau.dg.ThetaTau` |
| `DUES_CRON_SECRET` | Guards the **HTTP** cron route only — see below | — (route returns 500) |
| `NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_APP_URL` | Absolute links in emails | — (links come out relative) |
| `STRIPE_SECRET_KEY` | Server-created dues PaymentIntents | — (online checkout returns 503) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe Elements and native iOS PaymentSheet | — (online checkout returns 503) |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe events before changing the ledger | — (webhook returns 503) |
| `STRIPE_APPLE_MERCHANT_ID` | Apple Pay merchant identifier | `merchant.org.thetatau.dg.ThetaTau` |
| `ONLINE_DUES_PAYMENTS_ENABLED` | Enables creation of online dues PaymentIntents | `false` (online payments remain unavailable) |

Push requires **both** `APNS_KEY_ID` and `APNS_KEY_P8`; either one alone leaves
the channel off.

## Stripe dues payments

Develop and verify in the Theta Tau Stripe sandbox. Put the sandbox `sk_test_`
and `pk_test_` values in the local `.env` as `STRIPE_SECRET_KEY` and
`STRIPE_PUBLISHABLE_KEY`; use the matching live keys only in Netlify after the
test suite and live pilot pass. Neither secret key belongs in browser or iOS
code. Both clients obtain only the publishable key from the authenticated API.

Create a Stripe webhook endpoint for:

```
https://ttdg.org/api/stripe/webhook
```

Subscribe it to `payment_intent.processing`, `payment_intent.succeeded`,
`payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`,
`charge.dispute.created`, and `charge.dispute.closed`. Store that endpoint's
`whsec_` signing secret as `STRIPE_WEBHOOK_SECRET`. Test and live endpoints
have different secrets.

The iOS app also needs Apple Developer merchant ID
`merchant.org.thetatau.dg.ThetaTau`, the Apple Pay capability on its App ID,
and that merchant ID registered under Stripe's Apple Pay settings. The
entitlement and native PaymentSheet integration are already in this repo.
Register `ttdg.org` as a Stripe payment-method domain as well; Apple Pay does
not appear in the website Payment Element until the production domain is
registered.

For local webhook testing, run Stripe CLI forwarding to
`http://localhost:3000/api/stripe/webhook` and use the temporary `whsec_`
value it prints as `STRIPE_WEBHOOK_SECRET`.

Online dues currently charge exactly the principal. Do not add a blanket
processing percentage: ACH and debit cards cannot be treated as credit-card
surcharges. Offline Zelle, Venmo, cash, and check payments continue through the
treasurer verification queue.

## Resend

1. Add and verify **`alerts.ttdg.org`** in the Resend dashboard — the
   subdomain, not the apex. Automated mail is what generates bounces and spam
   complaints (sixty dues notices to student addresses, some of them
   graduated), and keeping it off `ttdg.org` means a bad send can never damage
   deliverability for real mail from real people.
2. Publish the DKIM/SPF records Resend gives you and wait for verification.
3. Set `RESEND_API_KEY` in the production environment.

**Status:** `RESEND_API_KEY` is present in local `.env` and the channel reports
itself configured. What is *not* confirmed is whether `alerts.ttdg.org` is
verified in the Resend dashboard — an unverified sending domain means Resend
accepts the call and then refuses to deliver, which looks like success from this
side. Check the dashboard before trusting a send.

Mail goes out from `dues@alerts.ttdg.org` as "Theta Tau Treasury". Dues, plans
and reimbursements deliberately share the `dues@` mailbox so one member's money
stays one thread in their inbox. That subdomain has receiving disabled, which
is why every message carries a `Reply-To` pointing at a mailbox a human reads.

## APNs

1. Apple Developer → **Keys** → create a key with the Apple Push Notifications
   service enabled. Team is **WVQ9Z7S7RR**, bundle **org.thetatau.dg.ThetaTau**.
2. Download the `.p8`. **Apple lets you download it exactly once.**
3. Set `APNS_KEY_ID` to the ten-character key ID.
4. Set `APNS_KEY_P8` to the file's contents. Newlines may be literal or
   `\n`-escaped — the adapter unescapes them, because escaping is what every
   hosting dashboard does to a pasted multi-line value.

**Status:** done for local development as of 2026-08-21 — key
**FCZNL3YJ38** ("Theta Tau chapter tools push"), team WVQ9Z7S7RR, is in `.env`
and verified against both APNs gateways (a send to a deliberately invalid device
token came back `BadDeviceToken`, which is what proves the provider token was
accepted). Production still needs the same two variables set in Netlify.

The iOS entitlement is already in place and needs nothing: debug builds carry
`aps-environment: development`, and `project.yml` overrides the Release config
to `production`. A device token minted against one gateway is rejected outright
by the other, which is the usual reason push works in Xcode and dies on the
first TestFlight upload.

The app asks for notification permission when dues are first assigned, not at
first launch, and registers its token at `POST /api/devices`.

## The nightly cron

`netlify/functions/dues-cron.ts` is a Netlify scheduled function running
`0 16 * * *` — 16:00 UTC is 9am Phoenix year-round, since Arizona doesn't
observe daylight saving. Netlify auto-detects it from the `config.schedule`
export; there is nothing to add to `netlify.toml`.

**It does not need `DUES_CRON_SECRET.`** The scheduled function calls
`runDuesCron()` in-process. The secret guards only `POST /api/dues/cron`, the
HTTP door used for manual runs and any external scheduler. Set it if you want
that route usable in production; the scheduled job runs either way.

The cron does real work beyond reminders: it marks installments late, advances
and defaults plans, and **reconciles the credit invariant** (a member must
never owe money and hold credit at the same time). That reconcile is load-
bearing, not belt-and-braces — the database is a standalone mongod with no
multi-document transactions, so it is what repairs a half-finished write.

## Verifying a deploy

```
npm run check:dues      # 143 pure-logic checks, no database
npm run check:plans     # 60 checks against the dev database
npm run check:notify    # 77
npm run check:history   # 28
```

To check the APNs credentials specifically — the one thing that can't be proven
without either a real device or a deliberate failure:

```
npm run check:apns
```

It signs a provider token with the configured `.p8` and pushes to an invalid
device token on both gateways. **`BadDeviceToken` is the passing result**: it
means Apple accepted the authentication and only rejected the fake destination.
`InvalidProviderToken` means the key, key ID or team don't line up. Nothing is
ever delivered to anyone.

Then `npx tsc --noEmit`. Build with `npx next build --no-lint` — the lint step
hangs indefinitely on some machines, and `tsc` covers the type half of it.

Against a running deploy, an unauthenticated request to any treasury route
should return **401**, not 404 or 500 — that proves the route compiled and auth
is wired. (`/api/devices` is POST-only and answers 405 to a GET, which is also
correct.)

## Still outstanding outside this repo

The chapter bylaws say a payment plan must be **"approved before the due
date."** The built behaviour counts from **`proposedAt`** — filing before the
deadline protects the member however long treasurer review takes. This was a
deliberate decision, and the bylaws still need a matching sentence.

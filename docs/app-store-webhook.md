# App Store Connect → Discord

App Store Connect posts every status change for the app to `POST /api/appstore/webhook`,
which verifies the signature and relays the event to Discord as an embed.

## What you paste into App Store Connect

Users and Access → Webhooks → the app → **Create Webhook**:

| Field | Value |
| --- | --- |
| Name | `Discord relay` (anything) |
| Payload URL | `https://ttdg.org/api/appstore/webhook` |
| Secret | the value of `APP_STORE_WEBHOOK_SECRET` |
| App | the Theta Tau app |
| Event Trigger | **Select All** |

The secret is not optional. The route answers 401 to anything it cannot verify,
so a webhook created without one will never deliver.

## Environment

| Variable | Required | What it does |
| --- | --- | --- |
| `APP_STORE_WEBHOOK_SECRET` | yes | Shared with App Store Connect. Apple signs each body with it. |
| `APP_STORE_DISCORD_WEBHOOK_URL` | yes | The Discord incoming webhook the embeds are posted to. |
| `APP_STORE_APP_NAME` | no | Name shown in the embed. Apple's payloads never carry it. Defaults to `Theta Tau`. |
| `APP_STORE_CONNECT_APP_ID` | no | The digits in the App Store Connect console URL. Set it and the embed title becomes a link into the console. |
| `APP_STORE_ICON_URL` | no | The app icon, used as the Discord avatar and the author-line icon. Defaults to the App Store artwork, whose mzstatic URL is tied to the current icon asset. Set this if the icon changes. |

## How it verifies

Apple sends `x-apple-signature: hmacsha256=<hex>`, an HMAC-SHA256 of the raw
request body under the secret. The route reads `req.text()` once and hashes
exactly those bytes; reparsing and re-serialising the JSON first would reorder
keys and the digest would never match.

## Status codes, and why

App Store Connect redelivers on any non-2xx, so the codes are a contract:

- **200** the embed reached Discord. Also returned for payload types we do not
  recognise, which are relayed with the raw type in the title. Retrying would
  not make us understand them any better.
- **401** the signature did not verify. Nothing is posted to Discord.
- **400** the body was not JSON.
- **500** the endpoint is missing one of its two required environment variables.
- **502** Discord refused the message after its own retries. Apple will try
  again, which is what we want.

## Events

All twelve `WebhookEventType` values are mapped, including the three
alternative-distribution ones that only appear for marketplace apps. States are
coloured by keyword rather than by a fixed list of Apple's enum cases, so a
state Apple adds later still arrives in the right colour instead of grey and
silent.

| Colour | Meaning | Example states |
| --- | --- | --- |
| Red | needs attention today | `FAILED`, `DEVELOPER_REJECTED`, `MISSING_EXPORT_COMPLIANCE`, any crash report |
| Green | it worked | `COMPLETE`, `READY_FOR_DISTRIBUTION`, `READY_FOR_BETA_TESTING` |
| Orange | a machine is chewing on it | `PROCESSING`, `AWAITING_UPLOAD` |
| Indigo | a person at Apple is holding it | `WAITING_FOR_REVIEW`, `IN_REVIEW`, `PENDING_DEVELOPER_RELEASE` |
| Blue | a person said something | tester screenshot feedback, ping deliveries |
| Grey | nothing to do yet | `PREPARE_FOR_SUBMISSION`, `READY_FOR_REVIEW` |

Orange and indigo are split on purpose. Orange means wait, there is nothing to
do. Indigo means Apple has it, which is the state worth watching.

## Anatomy of an embed

```
[app icon]  App Store Connect                              1:41 PM
┌ (colour bar)
│  [icon] Theta Tau
│  🔎  App Store: In Review
│  A reviewer at Apple is looking at it now.
│
│  `Waiting for Review`  →  **In Review**
│  ▰▰▰▰▱▱  Stage 4 of 6
│  APP_STORE_VERSION_APP_VERSION_STATE_UPDATED · 7c813492-…
└
```

The title carries the pipeline and the news, because that is all Discord shows
in a push notification. The stage bar appears only for states on the happy path:
a rejection has fallen off it, and "stage 3 of 6" would imply progress that is
not happening. The footer holds the event type and the resource id, which are
the two handles you need to look the thing up with the App Store Connect API.

## Checking it

`npm run check:appstore` proves the parsing and embed building offline against
Apple's own documented payloads and its published HMAC test vector. No network,
no database.

Once deployed, `GET /api/appstore/webhook` reports whether both secrets are
present without revealing either, and `POST /v1/webhookPings` from the App Store
Connect API sends a real test delivery through the whole path.

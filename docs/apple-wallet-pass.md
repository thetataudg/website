# Apple Wallet Pass Notes

## Pass style

This implementation uses the `generic` pass style so the pass can show:

- A wordmark banner via `logo.png`
- A member thumbnail via `thumbnail.png`
- A single primary field for the member name
- Header, secondary, and auxiliary fields on the front
- The rest of the member metadata on the back

Front-of-pass layout:

- Header: roll number, status, graduation year
- Primary: member name
- Secondary: major, minor
- Auxiliary: family line, pledge class
- Thumbnail: profile photo, or `public/ot.png` when missing

Back-of-pass fields:

- Roll number
- Status
- Graduation year
- Chapter
- Position
- Academics
- Family line
- Pledge class
- Majors
- Minors
- Committees
- Hometown
- Check-in usage
- NFC status

## Recommended artwork sizes

Apple documents logo sizes in points. For production assets, design at retina sizes:

- `logo.png`: target art box `160x50 pt`
- Preferred exported source: `480x150 px` transparent PNG
- Safe live area for the wordmark: keep critical text inside about `420x120 px`
- `thumbnail.png`: `90x90 pt`
- Preferred exported source: `270x270 px`
- `icon.png`: `29x29 pt`
- Preferred exported source: `87x87 px`

For the banner logo:

- Use a transparent PNG
- Keep the logo horizontally dominant
- Avoid very thin text strokes
- Leave at least 12 to 16 px of transparent padding around the art in the `480x150 px` export

## Certificates and identifiers

Required Apple setup:

- Register a Pass Type ID in Apple Developer
- Create a Pass Type ID certificate for that identifier
- Download the Apple WWDR intermediate certificate

Local file-based setup is supported. Place the files in one of:

- `secrets/apple-wallet`
- `certs/apple-wallet`
- `app/certs`
- or set `APPLE_WALLET_CERTS_DIR`

Supported files:

- A `.p12` pass certificate bundle, or
- `passCertificate.pem` plus `passKey.pem`
- A WWDR certificate file containing `wwdr` in the filename

For Netlify or any public-repo deployment, do not commit the certs. Use secret environment variables instead.

## Environment variables

Core pass config:

- `APPLE_WALLET_CERT_PASSWORD`
- `APPLE_WALLET_TEAM_IDENTIFIER`
- `APPLE_WALLET_PASS_TYPE_IDENTIFIER`
- `APPLE_WALLET_ORGANIZATION_NAME`

Certificate source options:

Local/runtime file paths:

- `APPLE_WALLET_CERTS_DIR`
- `APPLE_WALLET_CERT_P12_PATH`
- `APPLE_WALLET_WWDR_PATH`
- `APPLE_WALLET_SIGNER_CERT_PATH`
- `APPLE_WALLET_SIGNER_KEY_PATH`

Netlify-safe secret env vars:

- `APPLE_WALLET_CERT_P12_BASE64`
- `APPLE_WALLET_WWDR_BASE64`
- `APPLE_WALLET_WWDR_PEM`
- `APPLE_WALLET_SIGNER_CERT_BASE64`
- `APPLE_WALLET_SIGNER_CERT_PEM`
- `APPLE_WALLET_SIGNER_KEY_BASE64`
- `APPLE_WALLET_SIGNER_KEY_PEM`

Preferred Netlify setup:

1. Store the pass certificate as one secret env var:
   - `APPLE_WALLET_CERT_P12_BASE64`
2. Store the WWDR cert as one secret env var:
   - `APPLE_WALLET_WWDR_BASE64`
3. Store the `.p12` password:
   - `APPLE_WALLET_CERT_PASSWORD`
4. Store the pass identifiers:
   - `APPLE_WALLET_TEAM_IDENTIFIER`
   - `APPLE_WALLET_PASS_TYPE_IDENTIFIER`

At runtime, the server writes those secrets into a temporary directory under the function runtime and signs the pass from there. The files never need to live in git.

Example commands to prepare the values locally:

```bash
base64 -i Certificates.p12 | tr -d '\n'
base64 -i AppleWWDRCAG4.cer | tr -d '\n'
```

Then paste those outputs into the Netlify environment variable UI as secret values.

Optional app handoff:

- `APPLE_WALLET_APP_LAUNCH_URL`
- `APPLE_WALLET_ASSOCIATED_STORE_IDENTIFIERS`
- `APPLE_WALLET_ENABLE_APP_LINKS`

App links are now disabled unless `APPLE_WALLET_ENABLE_APP_LINKS=true`. This prevents Wallet from showing or launching an associated app by accident during pass design/testing.

Optional NFC support:

- `APPLE_WALLET_NFC_PUBLIC_KEY`
- `APPLE_WALLET_NFC_REQUIRES_AUTHENTICATION`
- `WALLET_NFC_API_SECRET`

Optional update-service toggle:

- `APPLE_WALLET_ENABLE_UPDATES`

If `APPLE_WALLET_ENABLE_UPDATES` is unset, the pass only advertises automatic updates when served from an `https://` URL. Set it to `false` to suppress Wallet update UI entirely while you are still testing. Set it to `true` only when the Apple pass web service is publicly reachable and working.

## Update web service

Implemented Apple Wallet web-service routes:

- `GET /api/wallet/apple-pass`
- `POST /api/wallet/apple-pass/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber`
- `DELETE /api/wallet/apple-pass/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber`
- `GET /api/wallet/apple-pass/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier`
- `GET /api/wallet/apple-pass/v1/passes/:passTypeIdentifier/:serialNumber`
- `POST /api/wallet/apple-pass/v1/log`
- `POST /api/wallet/apple-pass/nfc/resolve`

Notes:

- Each member gets a stable pass record with a serial number, Apple auth token, and NFC message.
- Member profile edits and photo uploads bump the pass update tag.
- Device registrations and push tokens are stored.
- APNs push delivery is not sent automatically yet. This backend stores what is needed so a later APNs sender can fan out update notifications to registered devices.

## NFC / proximity integration

When `APPLE_WALLET_NFC_PUBLIC_KEY` is set, generated passes include an `nfc` dictionary.

The pass uses a short persisted NFC message instead of the barcode token because Apple limits the NFC message payload to 64 bytes.

For backend resolution:

- Send `POST /api/wallet/apple-pass/nfc/resolve`
- Body: `{ "message": "<nfc-message>" }`
- Authenticate with `x-wallet-nfc-secret: <WALLET_NFC_API_SECRET>` or admin auth

This route returns the linked member profile data so a future mobile app or reader service can resolve the NFC payload to a member identity.

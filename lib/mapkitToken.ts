import crypto from "crypto";

import logger from "@/lib/logger";

/**
 * The token MapKit JS needs to draw a map in the browser.
 *
 * Portal-issued domain tokens can be non-expiring. A MapKit-enabled .p8 key is
 * also supported so deployments can mint short-lived tokens automatically.
 * `MAPKIT_JS_TOKEN` remains the deployment-wide static fallback.
 */

/** How long a minted token lives. Well inside Apple's seven-day ceiling. */
const MINTED_TTL_SECONDS = 60 * 30;
/** Re-mint this long before expiry so a map never loads on a dying token. */
const REMINT_MARGIN_SECONDS = 60 * 5;

let cached: { value: string; expiresAt: number } | null = null;

const ORIGIN_TOKENS: Record<string, string> = {
  "ttdg.org":
    "eyJraWQiOiIzUk44SDUzODcyIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJXVlE5WjdTN1JSIiwiaWF0IjoxNzg3NjcxMTg3LCJvcmlnaW4iOiJ0dGRnLm9yZyIsInNjb3BlIjoibWFwa2l0X2pzIn0.N403FkEuUC7StJTV-9px_PkPMC1aDrPqCyjIpD37PhhcaOC4SjeRbdfu-gCijRln5pQuQzCcIIbiAdCC_CkmwQ",
  "thetatau-dg.org":
    "eyJraWQiOiJSODVCOE5ZNzJXIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJXVlE5WjdTN1JSIiwiaWF0IjoxNzg3NjcxMTg3LCJvcmlnaW4iOiJ0aGV0YXRhdS1kZy5vcmciLCJzY29wZSI6Im1hcGtpdF9qcyJ9.hMcUw2A5-PoN6M_HG1KXUNFq-KgFPnDU-eKYTcL_zyhfRyMpHC3ldmaY21nexIvwRsPcVte9xtwfistW4ujqVQ",
};

export interface MapkitToken {
  token: string;
  /** Unix seconds, or 0 when the token has no expiration. */
  expiresAt: number;
  /** Where it came from, so the caller can warn about the one that runs out. */
  source: "minted" | "static";
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/// The .p8 file, either inline in the env var or with its newlines escaped —
/// which is what happens to it in every hosting dashboard on earth.
function privateKey(): string | null {
  const raw = process.env.MAPKIT_PRIVATE_KEY || process.env.MAPKIT_KEY_P8;
  if (!raw) return null;
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function mint(): MapkitToken | null {
  const key = privateKey();
  const keyId = process.env.MAPKIT_KEY_ID;
  const teamId = process.env.MAPKIT_TEAM_ID;
  if (!key || !keyId || !teamId) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - now > REMINT_MARGIN_SECONDS) {
    return { token: cached.value, expiresAt: cached.expiresAt, source: "minted" };
  }

  const expiresAt = now + MINTED_TTL_SECONDS;
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: teamId,
      iat: now,
      exp: expiresAt,
      // Without this the token works from anywhere, including somebody else's
      // site spending this chapter's Apple Maps quota.
      ...(process.env.MAPKIT_ORIGIN ? { origin: process.env.MAPKIT_ORIGIN } : {}),
    })
  );

  try {
    // ECDSA signatures come out DER-encoded by default; JWT wants the raw
    // r||s pair. The same trap as the APNs provider token in notify/push.
    const signature = crypto.sign(
      null,
      Buffer.from(`${header}.${payload}`),
      { key, dsaEncoding: "ieee-p1363" }
    );
    const token = `${header}.${payload}.${base64url(signature)}`;
    cached = { value: token, expiresAt };
    return { token, expiresAt, source: "minted" };
  } catch (err) {
    logger.error({ err }, "MAPKIT_PRIVATE_KEY could not be used to sign a MapKit JS token");
    return null;
  }
}

/** The `exp` claim of a token somebody pasted in, or null if it has none. */
function expiryOf(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

function statik(): MapkitToken | null {
  const token = process.env.MAPKIT_JS_TOKEN?.trim();
  if (!token) return null;
  return {
    token,
    // Portal-issued domain tokens may intentionally have no expiration.
    expiresAt: expiryOf(token) ?? 0,
    source: "static",
  };
}

function originToken(hostname?: string): MapkitToken | null {
  if (!hostname) return null;
  const token = ORIGIN_TOKENS[hostname.toLowerCase().replace(/\.$/, "")];
  if (!token) return null;
  return {
    token,
    expiresAt: expiryOf(token) ?? 0,
    source: "static",
  };
}

export function mapkitToken(hostname?: string): MapkitToken | null {
  // MapKit validates the browser origin against the JWT, so choose an
  // origin-bound token before falling back to the deployment-wide config.
  const boundToken = originToken(hostname);
  if (boundToken) return boundToken;
  return mint() ?? statik();
}

// Proves the .p8 signs a provider token Apple accepts. Sends to a deliberately
// invalid device token, so nothing is ever delivered to anyone: a reply of
// BadDeviceToken means the *authentication* succeeded, which is the only thing
// being tested here.
import http2 from "node:http2";
import crypto from "node:crypto";

const TEAM_ID = process.env.APNS_TEAM_ID || "WVQ9Z7S7RR";
const BUNDLE_ID = process.env.APNS_BUNDLE_ID || "org.thetatau.dg.ThetaTau";
const keyId = process.env.APNS_KEY_ID;
const raw = process.env.APNS_KEY_P8;

console.log("APNS_KEY_ID   :", keyId ? `${keyId} (${keyId.length} chars)` : "MISSING");
console.log("APNS_KEY_P8   :", raw ? `present, ${raw.length} chars` : "MISSING");
if (!keyId || !raw) process.exit(1);

const key = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
console.log("PEM header    :", key.trim().startsWith("-----BEGIN PRIVATE KEY-----") ? "ok" : "MALFORMED");
console.log("PEM footer    :", key.trim().endsWith("-----END PRIVATE KEY-----") ? "ok" : "MALFORMED");

const b64 = (i) => Buffer.from(i).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const header = b64(JSON.stringify({ alg: "ES256", kid: keyId }));
const payload = b64(JSON.stringify({ iss: TEAM_ID, iat: Math.floor(Date.now()/1000) }));
let jwt;
try {
  const sig = crypto.sign(null, Buffer.from(`${header}.${payload}`), { key, dsaEncoding: "ieee-p1363" });
  jwt = `${header}.${payload}.${b64(sig)}`;
  console.log("ES256 signing : ok, token is", jwt.length, "chars");
} catch (err) {
  console.log("ES256 signing : FAILED —", err.message);
  process.exit(1);
}

for (const host of ["api.sandbox.push.apple.com", "api.push.apple.com"]) {
  await new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    client.on("error", (e) => { console.log(`${host}: connect error — ${e.message}`); resolve(); });
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${"0".repeat(64)}`,
      "apns-topic": BUNDLE_ID,
      "apns-push-type": "alert",
      authorization: `bearer ${jwt}`,
    });
    let status = 0, body = "";
    req.on("response", (h) => { status = h[":status"]; });
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const reason = (() => { try { return JSON.parse(body).reason; } catch { return body || "(empty)"; } })();
      const verdict = reason === "BadDeviceToken"
        ? "AUTH OK — key accepted (the device token was fake on purpose)"
        : reason === "InvalidProviderToken" || reason === "ExpiredProviderToken"
          ? "AUTH FAILED — Apple rejected the key/team/kid combination"
          : `unexpected: ${reason}`;
      console.log(`\n${host}\n  status ${status}, reason ${reason}\n  -> ${verdict}`);
      client.close(); resolve();
    });
    req.setTimeout(10000, () => { console.log(`${host}: timeout`); client.close(); resolve(); });
    req.end(JSON.stringify({ aps: { alert: "connectivity check" } }));
  });
}

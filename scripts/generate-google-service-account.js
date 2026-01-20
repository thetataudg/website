#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const RAW = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const OUTPUT_PATH =
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_OUTPUT_PATH ||
  path.join(process.cwd(), "netlify", "generated", "google-service-account.json");

function exitWithMessage(message) {
  console.error(message);
  process.exit(1);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseCredentials(value) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to base64 attempt
  }

  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

if (!RAW) {
  console.warn(
    "GOOGLE_SERVICE_ACCOUNT_KEY is not set, skipping credential generation."
  );
  process.exit(0);
}

const credentials = parseCredentials(RAW);

if (!credentials) {
  exitWithMessage(
    "Unable to parse GOOGLE_SERVICE_ACCOUNT_KEY. Provide JSON or base64-encoded JSON."
  );
}

ensureDir(OUTPUT_PATH);
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(credentials, null, 2), "utf8");
console.log(`Google service account credentials written to ${OUTPUT_PATH}`);

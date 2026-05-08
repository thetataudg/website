export function parseAssociatedStoreIdentifiers() {
  return String(process.env.APPLE_WALLET_ASSOCIATED_STORE_IDENTIFIERS || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
}

export function shouldEnableAppleWalletUpdates(requestUrl: string) {
  if (process.env.APPLE_WALLET_ENABLE_UPDATES === "true") {
    return true;
  }

  if (process.env.APPLE_WALLET_ENABLE_UPDATES === "false") {
    return false;
  }

  try {
    const url = new URL(requestUrl);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function shouldEnableAppleWalletAppLinks() {
  return process.env.APPLE_WALLET_ENABLE_APP_LINKS === "true";
}

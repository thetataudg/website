import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

export function fcmConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
}

function messaging() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing");
    const serviceAccount = JSON.parse(raw.trim().replace(/^(['"])([\s\S]*)\1$/, "$2"));
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getMessaging();
}

export async function sendAndroidPush(
  token: string,
  title: string,
  body: string,
  link: string,
  imageUrl?: string,
): Promise<void> {
  await messaging().send({
    token,
    notification: { title, body, ...(imageUrl ? { imageUrl } : {}) },
    data: { link: link || "", url: link || "" },
    android: { priority: "high" },
  });
}

// lib/mail/resend.ts
// The handful of Resend endpoints chapter mail uses, over plain fetch like the
// rest of the codebase.
import logger from "@/lib/logger";

const API = "https://api.resend.com";

function headers(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface OutgoingEmail {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string[];
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  /// `path` is a URL Resend fetches itself, which is how attachments stay out
  /// of our request body.
  attachments?: Array<{ filename: string; path: string; content_type?: string }>;
}

export async function sendEmail(
  email: OutgoingEmail,
  idempotencyKey?: string
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(`${API}/emails`, {
      method: "POST",
      headers: headers(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      body: JSON.stringify(email),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, error: String(body?.message || body?.error || res.statusText) };
    }
    return { ok: true, id: String(body.id) };
  } catch (err: any) {
    logger.warn({ err }, "Resend send failed");
    return { ok: false, status: 0, error: "Could not reach the mail service." };
  }
}

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string[];
  subject?: string;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string> | Array<{ name: string; value: string }>;
  message_id?: string;
  created_at?: string;
  attachments?: Array<{
    id: string;
    filename?: string;
    content_type?: string;
    size?: number;
    content_disposition?: string;
    content_id?: string;
  }>;
}

export async function getReceivedEmail(id: string): Promise<ReceivedEmail | null> {
  const res = await fetch(`${API}/emails/receiving/${encodeURIComponent(id)}`, { headers: headers() });
  if (!res.ok) {
    logger.warn({ status: res.status, id }, "Could not fetch a received email from Resend");
    return null;
  }
  return (await res.json()) as ReceivedEmail;
}

export interface ReceivedAttachment {
  id: string;
  filename?: string;
  size?: number;
  content_type?: string;
  content_disposition?: string;
  content_id?: string;
  download_url: string;
  expires_at?: string;
}

export async function listReceivedAttachments(emailId: string): Promise<ReceivedAttachment[]> {
  const res = await fetch(
    `${API}/emails/receiving/${encodeURIComponent(emailId)}/attachments?limit=100`,
    { headers: headers() }
  );
  if (!res.ok) {
    logger.warn({ status: res.status, emailId }, "Could not list received attachments");
    return [];
  }
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body?.data) ? body.data : [];
}

/// A header off a received email, whichever shape Resend handed back.
export function headerValue(email: ReceivedEmail, name: string): string {
  const wanted = name.toLowerCase();
  const h = email.headers;
  if (!h) return "";
  if (Array.isArray(h)) {
    return h.find((row) => row?.name?.toLowerCase() === wanted)?.value ?? "";
  }
  for (const [key, value] of Object.entries(h)) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? String(value[0]) : String(value);
  }
  return "";
}

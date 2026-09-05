import {
  renderEmailHtml,
  renderEmailText,
  type EmailContent,
} from "./emailTemplate";

export type ClerkEmailTemplate = {
  slug: string;
  subject: string;
  content: EmailContent;
};

const REQUEST_CONTEXT =
  "Requested from {{requested_from}} at {{requested_at}}. If this was not you, you can ignore this email.";

export const CLERK_EMAIL_TEMPLATES: ClerkEmailTemplate[] = [
  {
    slug: "magic_link_sign_in",
    subject: "Your Theta Tau sign in link",
    content: {
      title: "Sign in to Theta Tau",
      preheader: "Your sign in link is ready.",
      paragraphs: ["Use this link to sign in. It expires in {{ttl_minutes}} minutes."],
      ctaLabel: "Sign in",
      ctaHref: "{{magic_link}}",
      footnote: REQUEST_CONTEXT,
    },
  },
  {
    slug: "invitation",
    subject: "You are invited to join Theta Tau",
    content: {
      title: "You are invited",
      preheader: "Create your Theta Tau account.",
      paragraphs: ["Use this invitation to create your chapter account."],
      ctaLabel: "Accept invitation",
      ctaHref: "{{action_url}}",
      footnote: "This invitation expires in {{invitation.expires_in_days}} days.",
    },
  },
  {
    slug: "verification_code",
    subject: "{{otp_code}} is your Theta Tau verification code",
    content: {
      title: "Verification code",
      preheader: "Your verification code is {{otp_code}}.",
      heroLabel: "Verification code",
      heroAmount: "{{otp_code}}",
      paragraphs: ["Enter this code to continue."],
      footnote: REQUEST_CONTEXT,
    },
  },
  {
    slug: "account_locked",
    subject: "Your Theta Tau account is locked",
    content: {
      title: "Account locked",
      preheader: "Your Theta Tau account is temporarily locked.",
      paragraphs: ["Your account was locked after {{failed_attempts}} failed sign in attempts."],
      meta: [
        { label: "Locked", value: "{{locked_date}}" },
        { label: "Unlocks", value: "{{unlock_time}}" },
      ],
    },
  },
  {
    slug: "password_changed",
    subject: "Your Theta Tau password was changed",
    content: {
      title: "Password changed",
      preheader: "Your Theta Tau password was changed.",
      paragraphs: ["The password for {{primary_email_address}} was changed."],
      footnote: "If this was not you, reset your password now.",
    },
  },
  {
    slug: "password_removed",
    subject: "Your Theta Tau password was removed",
    content: {
      title: "Password removed",
      preheader: "Your Theta Tau password was removed.",
      paragraphs: ["The password for {{primary_email_address}} was removed."],
      footnote: "If this was not you, secure your account now.",
    },
  },
  {
    slug: "primary_email_address_changed",
    subject: "Your Theta Tau email address was changed",
    content: {
      title: "Email address changed",
      preheader: "Your primary email address was changed.",
      paragraphs: ["Your primary email address is now {{new_email_address}}."],
      footnote: "If this was not you, secure your account now.",
    },
  },
  {
    slug: "reset_password_code",
    subject: "{{otp_code}} is your Theta Tau password reset code",
    content: {
      title: "Reset your password",
      preheader: "Your password reset code is {{otp_code}}.",
      heroLabel: "Reset code",
      heroAmount: "{{otp_code}}",
      paragraphs: ["Enter this code to reset your password."],
      footnote: REQUEST_CONTEXT,
    },
  },
  {
    slug: "new_device_sign_in",
    subject: "New sign in to your Theta Tau account",
    content: {
      title: "New device signed in",
      preheader: "A new device signed in to your account.",
      paragraphs: ["A new device signed in to your Theta Tau account."],
      meta: [
        { label: "Device", value: "{{device_type}}" },
        { label: "Browser", value: "{{browser_name}}" },
        { label: "Location", value: "{{location}}" },
        { label: "When", value: "{{session_created_at}}" },
      ],
      ctaLabel: "Review session",
      ctaHref: "{{revoke_session_url}}",
      footnote: "If this was not you, revoke the session.",
    },
  },
];

export function findClerkEmailTemplate(slug: string) {
  return CLERK_EMAIL_TEMPLATES.find((template) => template.slug === slug);
}

function valueAt(data: Record<string, unknown>, path: string): string {
  if (Object.prototype.hasOwnProperty.call(data, path)) {
    return String(data[path] ?? "");
  }

  let value: unknown = data;
  for (const part of path.split(".")) {
    if (!value || typeof value !== "object") return "";
    value = (value as Record<string, unknown>)[part];
  }
  return value == null ? "" : String(value);
}

function fill(value: string, data: Record<string, unknown>): string {
  return value.replace(/{{{?\s*([\w.]+)\s*}?}}/g, (_match, path: string) =>
    valueAt(data, path)
  );
}

function fillContent(content: EmailContent, data: Record<string, unknown>): EmailContent {
  return {
    ...content,
    title: fill(content.title, data),
    preheader: content.preheader ? fill(content.preheader, data) : undefined,
    paragraphs: content.paragraphs.map((paragraph) => fill(paragraph, data)),
    heroLabel: content.heroLabel ? fill(content.heroLabel, data) : undefined,
    heroAmount: content.heroAmount ? fill(content.heroAmount, data) : undefined,
    ctaLabel: content.ctaLabel ? fill(content.ctaLabel, data) : undefined,
    ctaHref: content.ctaHref ? fill(content.ctaHref, data) : undefined,
    footnote: content.footnote ? fill(content.footnote, data) : undefined,
    meta: content.meta?.map((row) => ({
      ...row,
      label: fill(row.label, data),
      value: fill(row.value, data),
    })),
  };
}

export function renderClerkTemplate(template: ClerkEmailTemplate) {
  return {
    slug: template.slug,
    subject: template.subject,
    html: renderEmailHtml(template.content),
    text: renderEmailText(template.content),
  };
}

export function renderClerkEmail(
  template: ClerkEmailTemplate,
  data: Record<string, unknown>
) {
  const content = fillContent(template.content, data);
  return {
    slug: template.slug,
    subject: fill(template.subject, data),
    html: renderEmailHtml(content),
    text: renderEmailText(content),
  };
}

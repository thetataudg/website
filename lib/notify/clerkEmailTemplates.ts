// lib/notify/clerkEmailTemplates.ts
//
// The chapter's own email layout, applied to the messages Clerk sends.
//
// Clerk's stock templates are plain black-on-white with a bare grey button, so
// a sign-in code looked nothing like the dues reminder that arrived an hour
// earlier. These render through the same `renderEmailHtml` every Resend message
// uses, so everything the chapter sends looks like it came from one place.
//
// The values in double braces are Clerk's own Handlebars variables, substituted
// by Clerk at send time. They pass through `renderEmailHtml` untouched because
// its escaping only touches & < > " ' and a brace is none of those. Only names
// listed in a template's `available_variables` may be used; anything else is
// left as literal text in the delivered mail.
import {
  renderEmailHtml,
  renderEmailText,
  type EmailContent,
} from "./emailTemplate";

export type ClerkEmailTemplate = {
  /// Clerk's identifier, e.g. "invitation".
  slug: string;
  /// Subject line, Handlebars allowed.
  subject: string;
  content: EmailContent;
};

/// A short line under a one-time code explaining where the request came from.
/// Clerk fills these in; when it cannot, they render empty rather than wrong.
const REQUEST_CONTEXT =
  "Requested from {{requested_from}} at {{requested_at}}. If this wasn't you, you can ignore this email.";

export const CLERK_EMAIL_TEMPLATES: ClerkEmailTemplate[] = [
  {
    slug: "invitation",
    subject: "You're invited to join {{app.name}}",
    content: {
      title: "You're invited to join Theta Tau",
      preheader:
        "Set up your chapter account. This invitation expires in {{invitation.expires_in_days}} days.",
      paragraphs: [
        "You have been invited to create a chapter account for Theta Tau, Delta Gamma. The button below sets up your account and takes you straight to the member tools.",
      ],
      ctaLabel: "Accept invitation",
      ctaHref: "{{action_url}}",
      footnote:
        "This invitation expires in {{invitation.expires_in_days}} days. If the button does not work, copy this link into your browser: {{action_url}}",
    },
  },
  {
    slug: "verification_code",
    subject: "{{otp_code}} is your Theta Tau verification code",
    content: {
      title: "Your verification code",
      preheader: "Your code is {{otp_code}}.",
      heroLabel: "Verification code",
      heroAmount: "{{otp_code}}",
      paragraphs: ["Enter this code when prompted. Do not share it with anyone."],
      footnote: REQUEST_CONTEXT,
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
      paragraphs: [
        "Enter this code to choose a new password. Do not share it with anyone.",
      ],
      footnote: REQUEST_CONTEXT,
    },
  },
  {
    slug: "magic_link_sign_in",
    subject: "Your Theta Tau sign in link",
    content: {
      title: "Sign in to Theta Tau",
      preheader: "Your sign in link, good for {{ttl_minutes}} minutes.",
      paragraphs: [
        "Use the button below to sign in to the chapter tools. No password needed.",
      ],
      ctaLabel: "Sign in",
      ctaHref: "{{magic_link}}",
      footnote:
        "This link works for {{ttl_minutes}} minutes and only once. Requested from {{requested_from}}. If this wasn't you, you can ignore this email.",
    },
  },
  {
    slug: "magic_link_sign_up",
    subject: "Your Theta Tau sign up link",
    content: {
      title: "Finish setting up your account",
      preheader: "Your sign up link, good for {{ttl_minutes}} minutes.",
      paragraphs: [
        "Use the button below to finish creating your chapter account.",
      ],
      ctaLabel: "Complete sign up",
      ctaHref: "{{magic_link}}",
      footnote:
        "This link works for {{ttl_minutes}} minutes and only once. Requested from {{requested_from}}. If this wasn't you, you can ignore this email.",
    },
  },
  {
    slug: "password_changed",
    subject: "Your Theta Tau password was changed",
    content: {
      title: "Your password was changed",
      preheader: "The password on {{primary_email_address}} was just changed.",
      paragraphs: [
        "The password for the chapter account on {{primary_email_address}} has been changed.",
      ],
      footnote:
        "If you did not do this, reset your password immediately and contact an officer.",
    },
  },
  {
    slug: "new_device_sign_in",
    subject: "New sign in to your Theta Tau account",
    content: {
      title: "New device signed in",
      preheader: "A new sign in from {{location}}.",
      paragraphs: [
        "Someone signed in to your chapter account from a new device.",
      ],
      meta: [
        { label: "Device", value: "{{device_type}}" },
        { label: "Browser", value: "{{browser_name}}" },
        { label: "Location", value: "{{location}}" },
        { label: "When", value: "{{session_created_at}}" },
      ],
      footnote:
        "If this wasn't you, change your password and contact an officer.",
    },
  },
];

/// Renders one template to the HTML and plain-text pair Clerk stores.
export function renderClerkTemplate(template: ClerkEmailTemplate) {
  return {
    slug: template.slug,
    subject: template.subject,
    html: renderEmailHtml(template.content),
    text: renderEmailText(template.content),
  };
}

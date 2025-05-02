// utils/email-to-slug.ts
export const emailToSlug = (email: string) =>
  encodeURIComponent(email.split("@")[0].toLowerCase());

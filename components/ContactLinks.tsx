import React from "react";
import { Mail, Phone } from "lucide-react";

import { formatPhone } from "@/lib/phone";

/**
 * A member's phone and email, as the actions they are.
 *
 * `tel:` and `mailto:` are handed the stored value; only the label is
 * prettified, because a formatted number is not reliably dialable.
 */
export default function ContactLinks({
  phone,
  email,
  className = "",
}: {
  phone?: string | null;
  email?: string | null;
  className?: string;
}) {
  if (!phone && !email) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm ${className}`}
    >
      {phone ? (
        <a
          href={`tel:${phone}`}
          className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Phone className="size-3.5 shrink-0" aria-hidden="true" />
          {formatPhone(phone)}
        </a>
      ) : null}
      {email ? (
        <a
          href={`mailto:${email}`}
          className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Mail className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{email}</span>
        </a>
      ) : null}
    </div>
  );
}

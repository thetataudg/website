import * as React from "react";
import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Presentational primitives shared by the member profile (`/member/profile/[rollNo]`)
 * and the brother detail view (`/member/brothers/[rollNo]`), which render the same
 * profile content with different affordances. Server-safe; semantic tokens only.
 */

/** A titled content card with an optional trailing action. */
export function Section({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Compact label/value tile. Renders as a <dt>/<dd> pair — wrap in a <dl>. */
export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-border bg-card px-3 py-2", className)}>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate text-sm font-semibold text-foreground">
        {value || "Not set"}
      </dd>
    </div>
  );
}

/** Inline "Label: value" row. Wrap in a <dl>. */
export function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-medium text-foreground">{label}:</dt>
      <dd className="min-w-0 text-muted-foreground">{value || "Not set"}</dd>
    </div>
  );
}

/** One entry in a projects / work / awards list. Renders an <li> — wrap in a <ul>. */
export function EntryItem({
  title,
  meta,
  description,
  link,
}: {
  title: string;
  meta?: string;
  description?: string;
  link?: string;
}) {
  return (
    <li className="rounded-md border border-border p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {meta ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
      ) : null}
      {description ? (
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
          {description}
        </p>
      ) : null}
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <span className="truncate">{link}</span>
          <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
        </a>
      ) : null}
    </li>
  );
}

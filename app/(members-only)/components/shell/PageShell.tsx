import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared members-only layout primitives. Server-safe (no client hooks) so
 * pages can stay server components. Consume semantic tokens only.
 */

/** Centered, max-width, responsive page gutter. */
export function PageContainer({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Trailing actions (buttons, menus). */
  actions?: React.ReactNode;
  /** Optional leading slot, e.g. a Breadcrumb, rendered above the title. */
  eyebrow?: React.ReactNode;
}

/** Primary page heading (h1) + description + actions. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow}
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

interface SectionHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Heading level for correct document outline (default h2). */
  as?: "h2" | "h3";
}

/** Secondary section heading. */
export function SectionHeader({
  title,
  description,
  actions,
  as: Heading = "h2",
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        <Heading className="m-0 text-lg font-semibold tracking-tight text-foreground">
          {title}
        </Heading>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

"use client";

// One labelled row in the account dialog.
//
// The layout Clerk used and members are already familiar with: a label in the
// left column, the value in the middle, and the action that changes it on the
// right. Pulled out because the dialog has eight of them and they must line up.

import { cn } from "@/lib/utils";

export default function AccountRow({
  label,
  action,
  children,
  className,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-2 border-b border-border py-4 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-start sm:gap-4",
        className
      )}
    >
      <p className="m-0 pt-0.5 text-sm font-medium text-foreground">{label}</p>
      <div className="min-w-0 text-sm text-muted-foreground">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

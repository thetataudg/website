import * as React from "react";
import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/**
 * Shared building blocks for the long profile-shaped forms: a labelled field,
 * and the "collection" pattern (a titled card holding repeatable entries, each
 * removable).
 *
 * Extracted from `ProfileInfoEditor` once the onboarding form became a second
 * consumer — the two render the same profile content, so they must not drift.
 * Server-safe (no client hooks); semantic tokens only.
 */

export function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && (
        <p
          id={`${id}-hint`}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export function CollectionCard({
  title,
  description,
  addLabel,
  onAdd,
  empty,
  children,
}: {
  title: string;
  description: string;
  addLabel: string;
  onAdd: () => void;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-4">
        <div className="space-y-1.5">
          <CardTitle role="heading" aria-level={3} className="text-base">
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAdd}
          className="shrink-0"
        >
          <Plus aria-hidden="true" />
          <span className="hidden sm:inline">{addLabel}</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {empty ? (
          <p className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing added yet.
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export function CollectionItem({
  title,
  removeLabel,
  onRemove,
  children,
}: {
  title: string;
  removeLabel: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-md border border-border bg-background/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onRemove}
          aria-label={removeLabel}
        >
          <Trash2 aria-hidden="true" />
          <span className="hidden sm:inline">Remove</span>
        </Button>
      </div>
      {children}
    </section>
  );
}

"use client";

import React, { useCallback, useMemo, useState } from "react";
import { CircleAlert, Loader2, PhoneCall, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPhone } from "@/lib/phone";

type SyncRow = {
  rollNo: string;
  name: string;
  current: string | null;
  incoming: string | null;
  raw: string;
  outcome: string;
  error?: string;
};

type SyncPlan = {
  sets: SyncRow[];
  changes: SyncRow[];
  unchanged: SyncRow[];
  invalid: SyncRow[];
  blank: SyncRow[];
  unmatchedAirtable: SyncRow[];
  unmatchedMembers: SyncRow[];
  duplicateRolls: string[];
  warnings: string[];
};

type Stage = "idle" | "review" | "done";

interface Props {
  show: boolean;
  canSubmit: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}

/// Counts first, rows underneath. The buckets that will change anything are
/// open by default; the ones that are only reassurance start closed, because
/// "unchanged" is usually most of the chapter.
function Bucket({
  title,
  rows,
  tone,
  open,
  showIncoming = true,
}: {
  title: string;
  rows: SyncRow[];
  tone?: "default" | "warn";
  open?: boolean;
  showIncoming?: boolean;
}) {
  if (!rows.length) return null;
  return (
    <details open={open} className="rounded-lg border bg-card">
      <summary className="flex cursor-pointer items-center gap-2 p-3 text-sm font-medium">
        {tone === "warn" ? (
          <TriangleAlert className="size-4 text-amber-500" aria-hidden="true" />
        ) : null}
        {title}
        <Badge variant="secondary" className="ml-auto">
          {rows.length}
        </Badge>
      </summary>
      <div className="max-h-64 overflow-y-auto border-t">
        {rows.map((row) => (
          <div
            key={`${row.rollNo}-${row.raw}-${row.name}`}
            className="flex items-baseline gap-3 border-b px-3 py-2 text-sm last:border-b-0"
          >
            <span className="w-12 shrink-0 text-muted-foreground">{row.rollNo || "—"}</span>
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
            {showIncoming ? (
              <span className="shrink-0 text-right tabular-nums">
                {row.current ? (
                  <span className="text-muted-foreground line-through">
                    {formatPhone(row.current)}
                  </span>
                ) : null}
                {row.current && row.incoming ? " → " : null}
                {row.incoming ? <span>{formatPhone(row.incoming)}</span> : null}
                {!row.incoming && row.error ? (
                  <span className="text-muted-foreground">{row.error}</span>
                ) : null}
                {!row.incoming && !row.error && row.raw ? (
                  <span className="text-muted-foreground">{row.raw}</span>
                ) : null}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  );
}

export default function PhoneSyncModal({ show, canSubmit, onClose, onCompleted }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [updated, setUpdated] = useState(0);

  const pendingCount = useMemo(
    () => (plan ? plan.sets.length + plan.changes.length : 0),
    [plan]
  );

  const call = useCallback(async (action: "validate" | "commit", expectedChanges?: number) => {
    const res = await fetch("/api/members/phone-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, expectedChanges }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Phone sync failed.");
    return json;
  }, []);

  const preview = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const json = await call("validate");
      setPlan(json.plan);
      setRowCount(json.airtableRowCount || 0);
      setStage("review");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [call]);

  const apply = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const json = await call("commit", pendingCount);
      setUpdated(json.updated || 0);
      setStage("done");
      onCompleted?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [call, pendingCount, onCompleted]);

  const reset = useCallback(() => {
    setStage("idle");
    setPlan(null);
    setError(null);
    setUpdated(0);
  }, []);

  const blocked = Boolean(plan?.duplicateRolls.length);

  return (
    <Dialog
      open={show}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="size-5" aria-hidden="true" />
            Sync phone numbers
          </DialogTitle>
          <DialogDescription>
            Reads phone numbers from Airtable and matches them to members by roll
            number. Nothing is saved until you review the changes and apply them.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <CircleAlert className="size-4" />
            <AlertTitle>Sync failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {stage === "idle" ? (
          <p className="text-sm text-muted-foreground">
            This pulls the current roster from Airtable. It may take a few seconds.
          </p>
        ) : null}

        {stage === "review" && plan ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Read {rowCount} rows from Airtable. {pendingCount} member
              {pendingCount === 1 ? "" : "s"} will be updated.
            </p>

            {plan.warnings.map((warning) => (
              <Alert key={warning}>
                <TriangleAlert className="size-4" />
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            ))}

            <Bucket title="Getting a number for the first time" rows={plan.sets} open />
            <Bucket title="Number is changing" rows={plan.changes} tone="warn" open />
            <Bucket title="Could not be read" rows={plan.invalid} tone="warn" />
            <Bucket title="No number in Airtable" rows={plan.blank} showIncoming={false} />
            <Bucket
              title="In Airtable, no matching member"
              rows={plan.unmatchedAirtable}
              showIncoming={false}
            />
            <Bucket
              title="Members with no Airtable row"
              rows={plan.unmatchedMembers}
              showIncoming={false}
            />
            <Bucket title="Already correct" rows={plan.unchanged} showIncoming={false} />
          </div>
        ) : null}

        {stage === "done" ? (
          <p className="text-sm">
            Updated {updated} member{updated === 1 ? "" : "s"}.
          </p>
        ) : null}

        <DialogFooter>
          {stage === "idle" ? (
            <Button onClick={preview} disabled={busy || !canSubmit}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Preview changes
            </Button>
          ) : null}

          {stage === "review" ? (
            <>
              <Button variant="outline" onClick={reset} disabled={busy}>
                Back
              </Button>
              <Button onClick={apply} disabled={busy || !pendingCount || blocked}>
                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Apply to {pendingCount} member{pendingCount === 1 ? "" : "s"}
              </Button>
            </>
          ) : null}

          {stage === "done" ? (
            <Button
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Done
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Lock,
  LockOpen,
  Timer,
} from "lucide-react";

import LoadingState, { LoadingSpinner } from "../../components/LoadingState";
import { PageContainer, PageHeader } from "../../components/shell/PageShell";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const timezone = "America/Phoenix";
const formatArizona = (value: string | null) => {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatCountdown = (endsAt: string | null) => {
  if (!endsAt) return "Awaiting schedule";
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Reopening soon";
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [] as string[];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
};

type LockdownState = {
  active: boolean;
  reason: string;
  durationMinutes: number;
  startedAt: string | null;
  endsAt: string | null;
  createdBy: string;
};

const initialState: LockdownState = {
  active: false,
  reason: "",
  durationMinutes: 0,
  startedAt: null,
  endsAt: null,
  createdBy: "",
};

export default function LockdownControl() {
  const [state, setState] = useState<LockdownState>(initialState);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmEngage, setConfirmEngage] = useState(false);

  useEffect(() => {
    let aborted = false;
    const fetchState = async () => {
      try {
        const response = await fetch("/api/lockdown");
        if (!response.ok) throw new Error("Failed to load lockdown");
        const data = await response.json();
        if (aborted) return;
        setState({
          active: Boolean(data.active),
          reason: data.reason || "",
          durationMinutes: Number(data.durationMinutes || 0),
          startedAt: data.startedAt || null,
          endsAt: data.endsAt || null,
          createdBy: data.createdBy || "",
        });
      } catch (err) {
        console.error(err);
        if (!aborted) setError("Unable to load status.");
      } finally {
        if (!aborted) setLoading(false);
      }
    };
    fetchState();
    return () => {
      aborted = true;
    };
  }, []);

  const countdown = useMemo(() => formatCountdown(state.endsAt), [state.endsAt]);

  const submit = async (action: "engage" | "release") => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload: any = { action };
      if (action === "engage") {
        payload.reason = reason;
        payload.durationMinutes = duration;
      }
      const res = await fetch("/api/admin/lockdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || body?.message || "Unable to update lockdown");
      }
      setState({
        active: Boolean(body.active),
        reason: body.reason || "",
        durationMinutes: Number(body.durationMinutes || 0),
        startedAt: body.startedAt || null,
        endsAt: body.endsAt || null,
        createdBy: body.createdBy || "",
      });
      setMessage(action === "engage" ? "Lockdown engaged." : "Lockdown released.");
    } catch (err: any) {
      console.error("Lockdown control failed", err);
      setError(err?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState message="Checking lockdown status..." />;
  }

  return (
    <PageContainer className="max-w-7xl space-y-6">
      <PageHeader
        title="Lockdown control"
        description="Temporarily restrict the member app during chapter business."
        actions={
          state.active ? (
            <Badge variant="destructive">
              <Lock className="size-3" />
              Lockdown active
            </Badge>
          ) : (
            <Badge variant="muted">
              <LockOpen className="size-3" />
              Cleared
            </Badge>
          )
        }
      />

      {/* Announced so the result of engaging or releasing is not silent. */}
      <div aria-live="polite" className="empty:hidden">
        {message && (
          <Alert variant="success">
            <CircleCheck aria-hidden="true" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Lockdown update failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current status</CardTitle>
          <CardDescription>
            Last updated by {state.createdBy || "leadership"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-3">
            <StatusTile
              label="Countdown"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="size-4 text-muted-foreground" aria-hidden="true" />
                  {countdown}
                </span>
              }
            />
            <StatusTile label="Started" value={formatArizona(state.startedAt)} />
            <StatusTile
              label="Scheduled end"
              value={formatArizona(state.endsAt)}
            />
          </dl>

          <div className="rounded-md border border-border p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reason
            </p>
            <p className="mt-1 text-sm text-foreground">
              {state.reason || "None provided"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Engage a lockdown</CardTitle>
          <CardDescription>
            Members lose access to the app until the lockdown is released or the
            duration runs out.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="space-y-1.5">
              <Label htmlFor="lockdown-reason">Reason</Label>
              <Input
                id="lockdown-reason"
                type="text"
                value={reason}
                placeholder="Why are we locked down?"
                onChange={(event) => setReason(event.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lockdown-duration">Duration</Label>
              <Input
                id="lockdown-duration"
                type="number"
                min={5}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                disabled={saving}
                aria-describedby="lockdown-duration-hint"
              />
              <p
                id="lockdown-duration-hint"
                className="text-xs text-muted-foreground"
              >
                Minutes, minimum 5.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              onClick={() => setConfirmEngage(true)}
              disabled={saving}
            >
              {saving ? <LoadingSpinner size="sm" /> : <Lock aria-hidden="true" />}
              Engage lockdown
            </Button>
            <Button
              variant="outline"
              onClick={() => submit("release")}
              disabled={saving || !state.active}
            >
              {saving ? (
                <LoadingSpinner size="sm" />
              ) : (
                <LockOpen aria-hidden="true" />
              )}
              Release lockdown
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Engaging cuts every member off, so it now asks first. Releasing is
        * the recovery path and stays a single click. */}
      <AlertDialog open={confirmEngage} onOpenChange={setConfirmEngage}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Engage lockdown now?</AlertDialogTitle>
            <AlertDialogDescription>
              Every member loses access to the app for {duration} minute
              {duration === 1 ? "" : "s"}, or until you release it.
              {reason ? ` Reason: ${reason}` : " No reason was entered."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmEngage(false);
                void submit("engage");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Engage lockdown
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

/** One status readout. Renders <dt>/<dd> — wrap in a <dl>. */
function StatusTile({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

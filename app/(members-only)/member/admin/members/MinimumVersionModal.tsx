"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CircleAlert, Loader2, Smartphone, TriangleAlert } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Current = {
  version: string;
  isCustom: boolean;
  updatedByName?: string;
  updatedAt?: string;
};

type State = {
  current: Current;
  codeDefault: string;
  latest: string;
  breakdown: Array<{ version: string; devices: number }>;
};

interface Props {
  show: boolean;
  canSubmit: boolean;
  onClose: () => void;
}

export default function MinimumVersionModal({ show, canSubmit, onClose }: Props) {
  const [state, setState] = useState<State | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /// Set when the server refuses because live devices would be blocked. The
  /// second press is the acknowledgement.
  const [confirmBlocking, setConfirmBlocking] = useState(0);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/app-version");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not load the current version.");
      setState(json);
      setValue(json.current.version);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (show) {
      setSaved(false);
      setConfirmBlocking(0);
      load();
    }
  }, [show, load]);

  const submit = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/app-version", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) {
          if (json?.requiresConfirmation) {
            setConfirmBlocking(json.blockedDevices || 0);
            setError(json.error);
            return;
          }
          throw new Error(json?.error || "Could not save.");
        }
        setState((s) => (s ? { ...s, current: json.current } : s));
        setValue(json.current.version);
        setConfirmBlocking(0);
        setSaved(true);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const dirty = state ? value.trim() !== state.current.version : false;

  return (
    <Dialog
      open={show}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="size-5" aria-hidden="true" />
            Minimum app version
          </DialogTitle>
          <DialogDescription>
            iPhones running an older version than this are blocked at launch and
            sent to the App Store. Takes effect the next time the app opens.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant={confirmBlocking ? "default" : "destructive"}>
            {confirmBlocking ? (
              <TriangleAlert className="size-4" />
            ) : (
              <CircleAlert className="size-4" />
            )}
            <AlertTitle>{confirmBlocking ? "This will lock people out" : "Failed"}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {saved ? (
          <Alert>
            <AlertDescription>
              Saved. The minimum is now {state?.current.version}.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="min-version">Minimum version</Label>
            <Input
              id="min-version"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setConfirmBlocking(0);
                setSaved(false);
              }}
              placeholder="2.0"
              inputMode="decimal"
              disabled={!canSubmit}
            />
            <p className="text-xs text-muted-foreground">
              {state?.current.isCustom
                ? `Currently set to ${state.current.version}${
                    state.current.updatedByName ? ` by ${state.current.updatedByName}` : ""
                  }.`
                : `No override set. Using the built-in default of ${state?.codeDefault ?? "—"}.`}
              {state?.latest ? ` Latest shipped build is ${state.latest}.` : null}
            </p>
          </div>

          {state?.breakdown?.length ? (
            <div className="rounded-lg border bg-card p-3">
              <p className="mb-2 text-sm font-medium">Versions in use (last 60 days)</p>
              <div className="space-y-1">
                {state.breakdown.map((row) => (
                  <div key={row.version} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{row.version}</span>
                    <Badge variant="secondary">
                      {row.devices} device{row.devices === 1 ? "" : "s"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <Alert>
            <TriangleAlert className="size-4" />
            <AlertDescription>
              Do not set this above a version that is live on the App Store. A
              blocked member has no way forward except updating, so a version
              nobody can install locks them out for good.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => submit({ reset: true })}
            disabled={busy || !canSubmit || !state?.current.isCustom}
          >
            Use built-in default
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Close
            </Button>
            <Button
              onClick={() =>
                submit({
                  minimumVersion: value.trim(),
                  confirmBlocking: confirmBlocking > 0,
                })
              }
              disabled={busy || !canSubmit || !dirty}
              variant={confirmBlocking ? "destructive" : "default"}
            >
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {confirmBlocking ? `Block ${confirmBlocking} and save` : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

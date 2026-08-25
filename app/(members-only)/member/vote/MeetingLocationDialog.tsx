"use client";

import * as React from "react";
import { Crosshair, Loader2, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import * as api from "./api";
import { VoteNote } from "./pieces";
import { AnchorPicker } from "./VoteMap";
import { metresLabel, type VotingAnchor } from "./types";

/**
 * Where this vote is being held.
 *
 * Two ways to answer, because there are two situations. An officer sitting in
 * the room clicks once and is done. An officer setting a vote up the night
 * before drags the map to the room instead. Both end at the same thing: a
 * point and a tolerance.
 *
 * The tolerance is the part worth taking seriously. A position fix indoors is
 * routinely off by tens of metres, and a wrongly flagged ballot is anonymous,
 * so nobody can ever come forward to clear it up. The default is generous on
 * purpose.
 */
const RADIUS_OPTIONS = [100, 200, 500, 1000];

export function MeetingLocationDialog({
  voteId,
  existing,
  open,
  onOpenChange,
  onSaved,
}: {
  voteId: string;
  existing: VotingAnchor | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [centre, setCentre] = React.useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel] = React.useState("");
  const [radius, setRadius] = React.useState(200);
  const [saving, setSaving] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Opens on whatever is already set, or on the officer's own position when
  // nothing is.
  React.useEffect(() => {
    if (!open) return;
    setError(null);

    if (existing) {
      setCentre({ lat: existing.lat, lng: existing.lng });
      setLabel(existing.label ?? "");
      // A radius set elsewhere may not be one of the four on offer; snap to the
      // nearest rather than silently changing it to a default.
      setRadius(
        RADIUS_OPTIONS.includes(existing.radiusMeters)
          ? existing.radiusMeters
          : RADIUS_OPTIONS.reduce((best, option) =>
              Math.abs(option - existing.radiusMeters) < Math.abs(best - existing.radiusMeters)
                ? option
                : best
            )
      );
      return;
    }

    setLabel("");
    setRadius(200);
    void locateHere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing]);

  async function locateHere() {
    setLocating(true);
    try {
      const fix = await api.captureLocation();
      if (!fix) {
        setError("Couldn't get a location fix. Drag the map to the meeting place instead.");
        return;
      }
      setError(null);
      setCentre({ lat: fix.lat, lng: fix.lng });
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    if (!centre) return;
    setSaving(true);
    setError(null);
    try {
      await api.setAnchor(voteId, {
        lat: centre.lat,
        lng: centre.lng,
        label: label.trim() || null,
        radiusMeters: radius,
      });
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The location could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Meeting location</DialogTitle>
          <DialogDescription>
            Drag the map so the pin sits on the room the chapter is meeting in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <AnchorPicker centre={centre} radiusMeters={radius} onCentreChange={setCentre} />

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={locating}
            onClick={() => void locateHere()}
          >
            {locating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Crosshair className="size-4" />
            )}
            Use where I am now
          </Button>

          <div className="space-y-2">
            <Label htmlFor="anchor-label">Name</Label>
            <Input
              id="anchor-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Chapter room"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="anchor-radius">Counts as here</Label>
            <Select
              value={String(radius)}
              onValueChange={(value) => setRadius(Number(value))}
            >
              <SelectTrigger id="anchor-radius">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RADIUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    Within {metresLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <VoteNote>
            Ballots cast beyond this without an approved proxy are flagged for review.
          </VoteNote>

          {error ? (
            <Alert variant="destructive">
              <TriangleAlert className="size-4" />
              <AlertTitle>Location</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!centre || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

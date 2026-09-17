"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
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
import { LoadingSpinner } from "../../../components/LoadingState";
import { LABEL_COLORS, labelColor } from "./labelColors";
import { LABEL_ICONS } from "./labelIcons";
import type { LabelColor, MailLabel } from "./types";

/// Create a label, or rename and recolor one. `label` null means create.
export default function LabelDialog({
  open,
  label,
  onClose,
  onSaved,
}: {
  open: boolean;
  label: MailLabel | null;
  onClose: () => void;
  onSaved: (label: MailLabel) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && <LabelForm key={label?.id ?? "new"} label={label} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function LabelForm({
  label,
  onClose,
  onSaved,
}: {
  label: MailLabel | null;
  onClose: () => void;
  onSaved: (label: MailLabel) => void;
}) {
  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState<LabelColor>(label?.color ?? "blue");
  const [icon, setIcon] = useState(label?.icon ?? "tag");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(label ? `/api/mail/labels/${label.id}` : "/api/mail/labels", {
        method: label ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color, icon }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't save that label.");
      onSaved(body.label);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="max-w-sm">
      <form onSubmit={save} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{label ? "Edit label" : "New label"}</DialogTitle>
          <DialogDescription className="sr-only">Name and color for the label.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="label-name">Name</Label>
          <Input id="label-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Color</legend>
          <div className="flex flex-wrap gap-2">
            {LABEL_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setColor(c.id)}
                aria-label={c.name}
                aria-pressed={color === c.id}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background",
                  c.dot,
                  color === c.id && "ring-2 ring-foreground"
                )}
              >
                {color === c.id && <Check className="size-3.5 text-white" />}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Icon</legend>
          <div className="grid grid-cols-5 gap-1.5">
            {LABEL_ICONS.map(({ id, name: iconName, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setIcon(id)}
                aria-label={iconName}
                title={iconName}
                aria-pressed={icon === id}
                className={cn(
                  "mail-nav-item flex h-10 items-center justify-center rounded-md border transition-colors hover:bg-accent",
                  icon === id ? cn("border-foreground/40 bg-accent", labelColor(color).text) : "border-transparent text-muted-foreground"
                )}
              >
                <Icon className="mail-nav-icon size-[18px]" data-motion="label" />
              </button>
            ))}
          </div>
        </fieldset>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || saving}>
            {saving && <LoadingSpinner size="sm" />}
            {label ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

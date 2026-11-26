"use client";

import { useState } from "react";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { budgetFetch, money, type Budget } from "../../../components/budget/api";
import { FieldError } from "../../../components/budget/ui";

/// Add, rename and archive a budget's lines.
export function LinesDialog({ budget, onClose, onChanged }: { budget: Budget; onClose: () => void; onChanged: (b: Budget) => void }) {
  const [current, setCurrent] = useState(budget);
  const [name, setName] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const duplicate = Boolean(name.trim()) && current.lines.some((l) => !l.archived && l.name.toLowerCase() === name.trim().toLowerCase());

  async function patch(json: any, message: string) {
    setBusy(true);
    try {
      const data = await budgetFetch<{ budget: Budget }>(`/api/budgets/ledger/${budget._id}`, { method: "PATCH", json });
      setCurrent(data.budget);
      onChanged(data.budget);
      toast.success(message);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Lines</DialogTitle>
          <DialogDescription>{current.committee.name}. Archiving moves what's left to Unassigned.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 p-0">
          {current.lines.filter((l) => l._id && !l.archived).map((l) => (
            <li key={l._id!} className="flex list-none items-center gap-2">
              <Input aria-label={`Rename ${l.name}`} value={names[l._id!] ?? l.name} onChange={(e) => setNames((n) => ({ ...n, [l._id!]: e.target.value }))} maxLength={80} />
              <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{money(l.totals.availableCents)}</span>
              {names[l._id!] !== undefined && names[l._id!] !== l.name ? (
                <Button size="sm" onClick={() => void patch({ action: "rename_line", lineId: l._id, name: names[l._id!] }, "Renamed.")} disabled={busy}>Save</Button>
              ) : null}
              <Button size="icon" variant="ghost" aria-label={`Archive ${l.name}`} onClick={() => void patch({ action: "archive_line", lineId: l._id }, `Archived ${l.name}.`)} disabled={busy}>
                <Archive aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        {duplicate ? <FieldError>There&apos;s already a line called {name.trim()}</FieldError> : null}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || duplicate) return;
            void patch({ action: "add_line", name: name.trim() }, `Added ${name.trim()}.`).then(() => setName(""));
          }}
        >
          <Input aria-label="New line name" placeholder="New line" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <Button type="submit" disabled={busy || !name.trim() || duplicate}>Add</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

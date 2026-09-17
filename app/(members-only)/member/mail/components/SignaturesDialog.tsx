"use client";

import { useEffect, useState } from "react";
import { Plus, Signature, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "../../../components/LoadingState";
import RichTextEditor from "./RichTextEditor";
import type { MailSignature, SignatureDefaults } from "./types";

type Payload = { signatures: MailSignature[]; defaults: SignatureDefaults };

const NONE = "none";

/// Gmail's Signature settings: a list of named signatures, an editor for the
/// selected one, and which to use for new mail and for replies.
export default function SignaturesDialog({
  open,
  signatures,
  defaults,
  onClose,
  onChange,
}: {
  open: boolean;
  signatures: MailSignature[];
  defaults: SignatureDefaults;
  onClose: () => void;
  onChange: (payload: Payload) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCreating(signatures.length === 0);
    setSelectedId((current) =>
      current && signatures.some((s) => s.id === current) ? current : signatures[0]?.id ?? null
    );
    // Only on open: the list changing underneath is the dialog's own doing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = signatures.find((s) => s.id === selectedId) ?? null;

  async function saveDefaults(next: Partial<SignatureDefaults>) {
    const res = await fetch("/api/mail/signatures", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(body.error || "Couldn't save that default.");
    onChange(body);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex h-[min(90vh,680px)] w-[calc(100%-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4 text-left">
          <DialogTitle>Signatures</DialogTitle>
          <DialogDescription>Added to the end of messages you write.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className="flex shrink-0 flex-col border-b sm:w-56 sm:border-b-0 sm:border-r">
            <ul className="m-0 flex max-h-40 list-none flex-col gap-0.5 overflow-y-auto p-2 sm:max-h-none sm:flex-1">
              {signatures.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setSelectedId(s.id);
                    }}
                    className={cn(
                      "flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium transition-colors",
                      !creating && selectedId === s.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                    )}
                  >
                    <Signature className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{s.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t p-2">
              <Button
                variant={creating ? "secondary" : "ghost"}
                className="h-9 w-full justify-start gap-2"
                onClick={() => setCreating(true)}
              >
                <Plus className="size-4" /> Create new
              </Button>
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            {creating ? (
              <SignatureEditor
                key="new"
                signature={null}
                onSaved={(payload, id) => {
                  onChange(payload);
                  setCreating(false);
                  setSelectedId(id);
                  toast.success("Signature created");
                }}
              />
            ) : selected ? (
              <SignatureEditor
                key={selected.id}
                signature={selected}
                onSaved={(payload) => {
                  onChange(payload);
                  toast.success("Signature saved");
                }}
                onDeleted={(payload) => {
                  onChange(payload);
                  setSelectedId(payload.signatures[0]?.id ?? null);
                  if (!payload.signatures.length) setCreating(true);
                }}
              />
            ) : (
              <p className="m-auto text-sm text-muted-foreground">No signature selected</p>
            )}

            <div className="grid shrink-0 gap-3 border-t px-5 py-4 sm:grid-cols-2">
              <DefaultPicker
                id="sig-default-new"
                label="For new emails use"
                value={defaults.newMail}
                signatures={signatures}
                onChange={(value) => saveDefaults({ newMail: value })}
              />
              <DefaultPicker
                id="sig-default-reply"
                label="On reply/forward use"
                value={defaults.reply}
                signatures={signatures}
                onChange={(value) => saveDefaults({ reply: value })}
              />
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DefaultPicker({
  id,
  label,
  value,
  signatures,
  onChange,
}: {
  id: string;
  label: string;
  value: string | null;
  signatures: MailSignature[];
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger id={id} className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No signature</SelectItem>
          {signatures.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SignatureEditor({
  signature,
  onSaved,
  onDeleted,
}: {
  signature: MailSignature | null;
  onSaved: (payload: Payload, id: string) => void;
  onDeleted?: (payload: Payload) => void;
}) {
  const [name, setName] = useState(signature?.name ?? "");
  const [value, setValue] = useState({ html: signature?.html ?? "", text: "" });
  const [includeSeparator, setIncludeSeparator] = useState(signature?.includeSeparator ?? true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = !signature
    || name !== signature.name
    || value.html !== signature.html
    || includeSeparator !== signature.includeSeparator;

  async function save() {
    if (!name.trim()) return toast.error("Give the signature a name.");
    setSaving(true);
    try {
      const res = await fetch(signature ? `/api/mail/signatures/${signature.id}` : "/api/mail/signatures", {
        method: signature ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, html: value.html, includeSeparator }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't save that signature.");
      onSaved({ signatures: body.signatures, defaults: body.defaults }, body.signature.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!signature) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/mail/signatures/${signature.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't delete that signature.");
      onDeleted?.({ signatures: body.signatures, defaults: body.defaults });
      toast.success(`Deleted "${signature.name}"`);
    } catch (err: any) {
      toast.error(err.message);
      setDeleting(false);
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-end gap-2 px-5 pb-3 pt-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="sig-name" className="text-xs text-muted-foreground">
            Name
          </Label>
          <Input
            id="sig-name"
            value={name}
            maxLength={60}
            placeholder="Chapter signature"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {signature && (
          <Button variant="ghost" size="icon" onClick={remove} disabled={deleting} aria-label="Delete signature">
            {deleting ? <LoadingSpinner size="sm" /> : <Trash2 className="size-4" />}
          </Button>
        )}
        <Button onClick={save} disabled={saving || !dirty || !name.trim()}>
          {saving && <LoadingSpinner size="sm" />}
          {signature ? "Save" : "Create"}
        </Button>
      </div>
      <div className="mx-5 mb-4 min-h-[12rem] min-w-0 flex-1 overflow-hidden rounded-md border">
        <RichTextEditor value={value} onChange={setValue} allowImages />
      </div>
      <label className="mx-5 mb-4 flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={includeSeparator}
          onCheckedChange={(checked) => setIncludeSeparator(checked === true)}
        />
        Add the “--” separator before this signature
      </label>
    </div>
  );
}

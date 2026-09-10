"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingSpinner } from "../../../components/LoadingState";
import { fileSize } from "./format";
import RichTextEditor, { type RichTextEditorHandle } from "./RichTextEditor";
import type { ComposeSeed, MailAttachment, UploadedFile } from "./types";

const MAX_FILE = 4.5 * 1024 * 1024;
const MAX_TOTAL = 25 * 1024 * 1024;
const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

function plainTextHtml(text: string): string {
  const escaped = (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const output: string[] = [];
  let quote: string[] = [];
  const flushQuote = () => {
    if (!quote.length) return;
    output.push(`<blockquote>${quote.join("<br>")}</blockquote>`);
    quote = [];
  };
  for (const line of escaped.split(/\r?\n/)) {
    if (line.startsWith("&gt;")) quote.push(line.replace(/^&gt; ?/, "") || "<br>");
    else {
      flushQuote();
      output.push(line || "<br>");
    }
  }
  flushQuote();
  return output.join("<br>");
}

const TITLES: Record<ComposeSeed["mode"], string> = {
  new: "New message",
  reply: "Reply",
  replyAll: "Reply all",
  forward: "Forward",
  draft: "Draft",
};

export default function ComposeDialog({
  seed,
  fromAddress,
  onClose,
  onSent,
}: {
  seed: ComposeSeed | null;
  fromAddress: string;
  onClose: () => void;
  onSent: () => void;
}) {
  return (
    <Dialog open={Boolean(seed)} onOpenChange={(open) => !open && onClose()}>
      {seed && <ComposeForm key={seed.draftId ?? seed.replyToId ?? seed.forwardOfId ?? "new"} seed={seed} fromAddress={fromAddress} onClose={onClose} onSent={onSent} />}
    </Dialog>
  );
}

function ComposeForm({
  seed,
  fromAddress,
  onClose,
  onSent,
}: {
  seed: ComposeSeed;
  fromAddress: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState<string[]>(seed.to ?? []);
  const [cc, setCc] = useState<string[]>(seed.cc ?? []);
  const [bcc, setBcc] = useState<string[]>(seed.bcc ?? []);
  const [showCc, setShowCc] = useState(Boolean(seed.cc?.length || seed.bcc?.length));
  const [subject, setSubject] = useState(seed.subject ?? "");
  const [text, setText] = useState(seed.text ?? "");
  const [html, setHtml] = useState(seed.html || plainTextHtml(seed.text ?? ""));
  const [files, setFiles] = useState<UploadedFile[]>(seed.attachments ?? []);
  const [forwarded, setForwarded] = useState<MailAttachment[]>(seed.forwardAttachments ?? []);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(seed.draftId);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const clientId = useRef<string>(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));
  const dirty = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<RichTextEditorHandle | null>(null);

  // Replies open with the cursor above the quoted text.
  useEffect(() => {
    if ((seed.mode === "reply" || seed.mode === "replyAll" || seed.mode === "forward") && bodyRef.current) {
      bodyRef.current.focusAtStart();
    }
  }, [seed.mode]);

  const totalSize = files.reduce((s, f) => s + f.size, 0) + forwarded.reduce((s, f) => s + f.size, 0);

  const saveDraft = useCallback(async () => {
    if (!dirty.current || sending) return;
    dirty.current = false;
    try {
      const res = await fetch("/api/mail/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, to, cc, bcc, subject, text, html, attachments: files }),
      });
      if (res.ok) {
        const body = await res.json();
        setDraftId(body.draftId);
        setSavedAt(new Date());
      }
    } catch {
      dirty.current = true;
    }
  }, [draftId, to, cc, bcc, subject, text, html, files, sending]);

  useEffect(() => {
    dirty.current = true;
  }, [to, cc, bcc, subject, text, html, files]);

  // Autosave a few seconds after the last change.
  useEffect(() => {
    if (!to.length && !subject && !text.trim() && !files.length) return;
    const handle = setTimeout(saveDraft, 3000);
    return () => clearTimeout(handle);
  }, [to, cc, bcc, subject, text, html, files, saveDraft]);

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    let running = totalSize;
    for (const file of incoming) {
      if (file.size > MAX_FILE) {
        toast.error(`${file.name} is larger than 4.5 MB.`);
        continue;
      }
      if (running + file.size > MAX_TOTAL) {
        toast.error("Attachments can total 25 MB at most.");
        break;
      }
      running += file.size;
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/mail/uploads", { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Upload failed.");
        setFiles((current) => [...current, body as UploadedFile]);
      } catch (err: any) {
        toast.error(`${file.name}: ${err.message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function send() {
    const pending = [...to, ...cc, ...bcc];
    const bad = pending.find((a) => !EMAIL.test(a));
    if (!to.length) return toast.error("Add at least one recipient.");
    if (bad) return toast.error(`Not a valid address: ${bad}`);
    setSending(true);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc,
          bcc,
          subject,
          text,
          html,
          attachments: files,
          replyToId: seed.replyToId,
          forwardOfId: seed.forwardOfId,
          forwardAttachments: forwarded.map((a) => a.index),
          draftId,
          clientId: clientId.current,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "The message couldn't be sent.");
        return;
      }
      toast.success("Message sent");
      dirty.current = false;
      onSent();
    } finally {
      setSending(false);
    }
  }

  async function close() {
    if (dirty.current && (to.length || subject || text.trim() || files.length)) await saveDraft();
    onClose();
  }

  async function discard() {
    dirty.current = false;
    if (draftId) await fetch(`/api/mail/messages/${draftId}`, { method: "DELETE" }).catch(() => undefined);
    onClose();
  }

  return (
    <DialogContent
      className="flex h-[min(90vh,760px)] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0"
      onInteractOutside={(e) => e.preventDefault()}
      onEscapeKeyDown={(e) => {
        e.preventDefault();
        void close();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
      }}
    >
      <DialogHeader className="shrink-0 border-b px-5 py-4 text-left">
        <DialogTitle>{TITLES[seed.mode]}</DialogTitle>
        <DialogDescription className="text-xs">From {fromAddress}</DialogDescription>
      </DialogHeader>

      <div className="shrink-0 divide-y border-b">
        <RecipientRow label="To" values={to} onChange={setTo} trailing={
          !showCc && (
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowCc(true)}>
              Cc Bcc
            </button>
          )
        } />
        {showCc && <RecipientRow label="Cc" values={cc} onChange={setCc} />}
        {showCc && <RecipientRow label="Bcc" values={bcc} onChange={setBcc} />}
        {/* The whole row is the click target; the field inside is bare so it
            never paints a box over the row dividers. */}
        <label className="flex h-11 cursor-text items-center gap-2 px-5">
          <span className="w-14 shrink-0 text-sm text-muted-foreground">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
            maxLength={300}
          />
        </label>
      </div>

      <div className={cn("relative min-h-0 flex-1", dragging && "bg-accent/40")}>
        <RichTextEditor
          editorHandle={bodyRef}
          value={{ html, text }}
          onChange={(next) => {
            setHtml(next.html);
            setText(next.text);
          }}
        />
        {dragging && (
          <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
            Drop files to attach
          </div>
        )}
      </div>

      {(files.length > 0 || forwarded.length > 0 || uploading > 0) && (
        <div className="flex shrink-0 flex-wrap gap-2 border-t px-5 py-3">
          {forwarded.map((a) => (
            <Chip key={`fwd-${a.index}`} name={a.filename} size={a.size} onRemove={() => setForwarded((l) => l.filter((x) => x.index !== a.index))} />
          ))}
          {files.map((f) => (
            <Chip key={f.key} name={f.filename} size={f.size} onRemove={() => setFiles((l) => l.filter((x) => x.key !== f.key))} />
          ))}
          {uploading > 0 && (
            <span className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs text-muted-foreground">
              <LoadingSpinner size="sm" /> Uploading
            </span>
          )}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 border-t px-5 py-3">
        <Button onClick={send} disabled={sending || uploading > 0}>
          {sending && <LoadingSpinner size="sm" />}
          Send
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button variant="ghost" size="icon" onClick={() => fileInput.current?.click()} aria-label="Attach files">
          <Paperclip className="size-4" />
        </Button>
        <span className="text-xs text-muted-foreground">{savedAt ? "Draft saved" : ""}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={discard} disabled={sending}>
            Discard
          </Button>
          <Button variant="outline" onClick={close} disabled={sending}>
            Close
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

function RecipientRow({
  label,
  values,
  onChange,
  trailing,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  trailing?: React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    const parts = raw.split(/[,;\s]+/).map((p) => p.trim().replace(/^<|>$/g, "")).filter(Boolean);
    if (!parts.length) return;
    onChange(Array.from(new Set([...values, ...parts])));
    setDraft("");
  };

  return (
    // Not a <label>: the chips' remove buttons would become its target. Empty
    // space in the row focuses the field instead.
    <div
      className="flex min-h-11 cursor-text items-center gap-2 px-5 py-1.5"
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest("button, input")) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}
    >
      <span className="w-14 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className={cn(
              "flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs",
              !EMAIL.test(v) && "bg-destructive/15 text-destructive"
            )}
          >
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            const value = e.target.value;
            if (/[,;]$/.test(value)) commit(value);
            else setDraft(value);
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === "Tab") && draft.trim()) {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => commit(draft)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            if (/[,;\s]/.test(pasted.trim())) {
              e.preventDefault();
              commit(pasted);
            }
          }}
          className="h-8 min-w-[10rem] flex-1 bg-transparent text-sm text-foreground outline-none"
          aria-label={label}
          type="email"
          autoComplete="email"
          multiple
        />
      </div>
      {trailing}
    </div>
  );
}

function Chip({ name, size, onRemove }: { name: string; size: number; onRemove: () => void }) {
  return (
    <span className="flex max-w-full items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
      <Paperclip className="size-3.5 shrink-0" />
      <span className="truncate font-medium">{name}</span>
      <span className="shrink-0 text-muted-foreground">{fileSize(size)}</span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${name}`}>
        <X className="size-3.5" />
      </button>
    </span>
  );
}

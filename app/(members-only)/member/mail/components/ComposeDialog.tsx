"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Ellipsis, Paperclip, Settings2, Signature, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingSpinner } from "../../../components/LoadingState";
import { fileSize } from "./format";
import MessageBody from "./MessageBody";
import RichTextEditor, { type RichTextEditorHandle } from "./RichTextEditor";
import type { ComposeSeed, MailAttachment, MailSignature, SignatureDefaults, UploadedFile } from "./types";

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
    if (line.startsWith("&gt;")) quote.push(line.replace(/^(?:&gt;)+ ?/, "") || "<br>");
    else {
      flushQuote();
      output.push(line || "<br>");
    }
  }
  flushQuote();
  return output.join("<br>");
}

const LEGACY_QUOTE_SELECTOR = [
  ".gmail_quote_container",
  "div.gmail_quote",
  "blockquote.gmail_quote",
  'blockquote[type="cite"]',
  ".yahoo_quoted",
  "#divRplyFwdMsg",
].join(",");

function editableText(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  copy.querySelectorAll("div, p, li, blockquote, h1, h2, h3").forEach((node) => node.append("\n"));
  return (copy.textContent || "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/// Drafts created before quoted content was stored separately may contain the
/// original message inside the editable body. Remove only recognizable mail
/// quote markup/markers, preserve the member's writing and signature, and let
/// the separate quote preview render the original instead.
function normalizeDraftBody(seed: ComposeSeed): { html: string; text: string } {
  const html = seed.html || plainTextHtml(seed.text ?? "");
  if (seed.mode !== "draft" || !(seed.replyToId || seed.forwardOfId) || typeof window === "undefined") {
    return { html, text: seed.text ?? "" };
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const signature = doc.body.querySelector<HTMLElement>("[data-mail-signature]");
  const signatureHtml = signature?.outerHTML ?? "";
  signature?.remove();

  const knownQuote = doc.body.querySelector(LEGACY_QUOTE_SELECTOR);
  if (knownQuote) {
    knownQuote.remove();
  } else {
    const children = Array.from(doc.body.children);
    const quoteStart = children.findIndex((element) => {
      const value = (element.textContent || "").replace(/\u00a0/g, " ").trim();
      return /Forwarded message/i.test(value)
        || /^On\b[\s\S]*\bwrote:/i.test(value)
        || /^>{2,}(?:\s|$)/.test(value);
    });
    if (quoteStart >= 0) children.slice(quoteStart).forEach((element) => element.remove());
  }

  // Some contentEditable documents put every line directly in the body. If a
  // legacy double-quoted body survived as one text run, remove that run too.
  if (!doc.body.children.length && /^>{2,}(?:\s|$)/.test((doc.body.textContent || "").trim())) {
    doc.body.textContent = "";
  }
  if (signatureHtml) doc.body.insertAdjacentHTML("beforeend", signatureHtml);
  return { html: doc.body.innerHTML, text: editableText(doc.body) };
}

const TITLES: Record<ComposeSeed["mode"], string> = {
  new: "New message",
  reply: "Reply",
  replyAll: "Reply all",
  forward: "Forward",
  draft: "Draft",
};

type SignatureProps = {
  /// False until the mailbox has fetched them, so the default isn't skipped
  /// just because the composer opened first.
  signaturesReady: boolean;
  signatures: MailSignature[];
  signatureDefaults: SignatureDefaults;
  onManageSignatures: () => void;
};

export default function ComposeDialog({
  seed,
  fromAddress,
  onClose,
  onSent,
  ...signatureProps
}: {
  seed: ComposeSeed | null;
  fromAddress: string;
  onClose: () => void;
  onSent: () => void;
} & SignatureProps) {
  return (
    <Dialog open={Boolean(seed)} onOpenChange={(open) => !open && onClose()}>
      {seed && (
        <ComposeForm
          key={seed.draftId ?? seed.replyToId ?? seed.forwardOfId ?? "new"}
          seed={seed}
          fromAddress={fromAddress}
          onClose={onClose}
          onSent={onSent}
          {...signatureProps}
        />
      )}
    </Dialog>
  );
}

function ComposeForm({
  seed,
  fromAddress,
  onClose,
  onSent,
  signaturesReady,
  signatures,
  signatureDefaults,
  onManageSignatures,
}: {
  seed: ComposeSeed;
  fromAddress: string;
  onClose: () => void;
  onSent: () => void;
} & SignatureProps) {
  const initialBody = useRef<{ html: string; text: string } | null>(null);
  if (!initialBody.current) initialBody.current = normalizeDraftBody(seed);
  const [to, setTo] = useState<string[]>(seed.to ?? []);
  const [cc, setCc] = useState<string[]>(seed.cc ?? []);
  const [bcc, setBcc] = useState<string[]>(seed.bcc ?? []);
  const [showCc, setShowCc] = useState(Boolean(seed.cc?.length || seed.bcc?.length));
  const [subject, setSubject] = useState(seed.subject ?? "");
  const [text, setText] = useState(initialBody.current.text);
  const [html, setHtml] = useState(initialBody.current.html);
  const [files, setFiles] = useState<UploadedFile[]>(seed.attachments ?? []);
  const [forwarded, setForwarded] = useState<MailAttachment[]>(seed.forwardAttachments ?? []);
  const [uploading, setUploading] = useState(0);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(seed.draftId);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const hasQuote = Boolean(seed.replyToId || seed.forwardOfId);
  const [includeQuote, setIncludeQuote] = useState(seed.includeQuote !== false);
  const [showQuote, setShowQuote] = useState(false);
  const clientId = useRef<string>(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));
  const dirty = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<RichTextEditorHandle | null>(null);

  // The default signature goes in once, as the composer opens. A draft already
  // carries whatever signature it was saved with, so it gets none added.
  const [signatureId, setSignatureId] = useState<string | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const signatureApplied = useRef(false);
  useEffect(() => {
    if (signatureApplied.current || !signaturesReady || !editorReady || seed.mode === "draft" || !bodyRef.current) return;
    const defaultId = seed.mode === "new" ? signatureDefaults.newMail : signatureDefaults.reply;
    const signature = signatures.find((s) => s.id === defaultId);
    signatureApplied.current = true;
    if (!signature) return;
    bodyRef.current.setSignature(signature);
    setSignatureId(signature.id);
  }, [seed.mode, signaturesReady, editorReady, signatures, signatureDefaults]);

  /// Has the member written anything? A signature on its own doesn't count, so
  /// opening and closing a new message doesn't leave a draft behind.
  const hasWriting = useCallback(
    () => Boolean((bodyRef.current?.writtenText() ?? text).trim()),
    [text]
  );

  useEffect(() => {
    if (editorReady && seed.mode === "draft") setSignatureId(bodyRef.current?.currentSignatureId() ?? null);
  }, [seed.mode, editorReady]);

  function chooseSignature(signature: MailSignature | null) {
    bodyRef.current?.setSignature(signature);
    setSignatureId(signature?.id ?? null);
  }

  // Replies open with the cursor above the quoted text.
  useEffect(() => {
    if (editorReady && (seed.mode === "reply" || seed.mode === "replyAll" || seed.mode === "forward") && bodyRef.current) {
      bodyRef.current.focusAtStart();
    }
  }, [seed.mode, editorReady]);

  const totalSize = files.reduce((s, f) => s + f.size, 0) + forwarded.reduce((s, f) => s + f.size, 0);

  const saveDraft = useCallback(async () => {
    if (!dirty.current || sending) return;
    dirty.current = false;
    try {
      const res = await fetch("/api/mail/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          to,
          cc,
          bcc,
          subject,
          text,
          html,
          attachments: files,
          replyToId: seed.replyToId,
          forwardOfId: seed.forwardOfId,
          includeQuote: hasQuote ? includeQuote : undefined,
        }),
      });
      if (res.ok) {
        const body = await res.json();
        setDraftId(body.draftId);
        setSavedAt(new Date());
      }
    } catch {
      dirty.current = true;
    }
  }, [draftId, to, cc, bcc, subject, text, html, files, sending, seed.replyToId, seed.forwardOfId, hasQuote, includeQuote]);

  useEffect(() => {
    dirty.current = true;
  }, [to, cc, bcc, subject, text, html, files, includeQuote]);

  // Autosave a few seconds after the last change.
  useEffect(() => {
    if (!to.length && !subject && !hasWriting() && !files.length) return;
    const handle = setTimeout(saveDraft, 3000);
    return () => clearTimeout(handle);
  }, [to, cc, bcc, subject, text, html, files, includeQuote, saveDraft, hasWriting]);

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
          includeQuote: hasQuote ? includeQuote : undefined,
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
    if (dirty.current && (to.length || subject || hasWriting() || files.length)) await saveDraft();
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

      <div className={cn("relative flex min-h-0 flex-1 flex-col", dragging && "bg-accent/40")}>
        <div className="min-h-0 flex-1">
          <RichTextEditor
            editorHandle={bodyRef}
            onReady={() => setEditorReady(true)}
            value={{ html, text }}
            onChange={(next) => {
              setHtml(next.html);
              setText(next.text);
            }}
          />
        </div>
        {/* Gmail's trimmed content: the original goes out under the reply,
            written by the server from the stored message so its formatting
            and pictures survive. Here it is only previewed. */}
        {hasQuote && includeQuote && (
          <div className="max-h-[45%] shrink-0 overflow-y-auto border-t px-5 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowQuote((v) => !v)}
                className="flex h-5 items-center rounded-sm bg-muted px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-expanded={showQuote}
                aria-label={showQuote ? "Hide quoted text" : "Show quoted text"}
              >
                <Ellipsis className="size-4" />
              </button>
              {showQuote && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setIncludeQuote(false)}
                >
                  Remove quoted text
                </button>
              )}
            </div>
            {showQuote && seed.quoted && (
              <div className="mt-2">
                <MessageBody
                  html={seed.quoted.html}
                  text={seed.quoted.text}
                  inlineImageUrls={seed.quoted.inlineImageUrls}
                  foldQuotes={false}
                />
              </div>
            )}
          </div>
        )}
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Insert signature" title="Insert signature">
              <Signature className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel>Signature</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => chooseSignature(null)}>
              <Check className={cn("size-4", signatureId ? "opacity-0" : "opacity-100")} />
              No signature
            </DropdownMenuItem>
            {signatures.map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => chooseSignature(s)}>
                <Check className={cn("size-4", signatureId === s.id ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{s.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onManageSignatures}>
              <Settings2 className="size-4" /> Manage signatures
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

"use client";

import { useRef, useState } from "react";
import { Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Attachment, AttachmentActions, AttachmentContent, AttachmentMedia, AttachmentTitle } from "@/components/ui/attachment";
import { LoadingSpinner } from "../LoadingState";

export interface Receipt {
  url: string;
  name: string;
}

/// Uploads through the existing private receipt bucket route.
export function ReceiptPicker({
  receipts,
  onChange,
  onError,
  onBusy,
}: {
  receipts: Receipt[];
  onChange: (next: Receipt[]) => void;
  onError: (message: string | null) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function attach(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    onBusy?.(true);
    onError(null);
    try {
      const form = new FormData();
      form.append("receipt", file);
      const res = await fetch("/api/reimbursements/receipts", { method: "POST", body: form });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't upload that");
      onChange([...receipts, { url: payload.url, name: file.name }]);
    } catch (err: any) {
      onError(err.message || "Couldn't upload that");
    } finally {
      setUploading(false);
      onBusy?.(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {receipts.length > 0 && (
        <ul className="space-y-2">
          {receipts.map((receipt) => (
            <li key={receipt.url}>
              <Attachment>
                <AttachmentMedia>
                  <Paperclip aria-hidden="true" />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{receipt.name}</AttachmentTitle>
                </AttachmentContent>
                <AttachmentActions>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onChange(receipts.filter((r) => r.url !== receipt.url))}
                    aria-label={`Remove ${receipt.name}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </AttachmentActions>
              </Attachment>
            </li>
          ))}
        </ul>
      )}
      <input ref={input} type="file" className="sr-only" accept="image/*,.pdf" onChange={attach} />
      <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={uploading || receipts.length >= 8}>
        {uploading ? <LoadingSpinner size="sm" /> : <Paperclip aria-hidden="true" />}
        {uploading ? "Uploading…" : "Attach a receipt"}
      </Button>
    </div>
  );
}

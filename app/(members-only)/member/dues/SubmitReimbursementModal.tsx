"use client";

import { useRef, useState } from "react";
import { CircleAlert, Paperclip, Trash2 } from "lucide-react";

import { LoadingSpinner } from "../../components/LoadingState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CATEGORIES = [
  { value: "rush", label: "Rush" },
  { value: "philanthropy", label: "Philanthropy" },
  { value: "brotherhood", label: "Brotherhood" },
  { value: "service", label: "Service" },
  { value: "professionalism", label: "Professionalism" },
  { value: "supplies", label: "Supplies" },
  { value: "travel", label: "Travel" },
  { value: "other", label: "Something else" },
];

function todayLocal() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

type Receipt = { url: string; name: string };

export default function SubmitReimbursementModal({
  onClose,
  onFiled,
}: {
  onClose: () => void;
  onFiled: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("rush");
  const [purchasedOn, setPurchasedOn] = useState(todayLocal());
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const amountCents = Math.round(Number(amount) * 100);
  const invalid =
    !Number.isFinite(amountCents) || amountCents <= 0 || !description.trim();

  async function attach(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("receipt", file);
      const res = await fetch("/api/reimbursements/receipts", {
        method: "POST",
        body: form,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't upload that");
      setReceipts((current) => [...current, { url: payload.url, name: file.name }]);
    } catch (err: any) {
      setError(err.message || "Couldn't upload that");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (invalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reimbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents,
          description: description.trim(),
          category,
          purchasedOn,
          receiptUrls: receipts.map((receipt) => receipt.url),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Couldn't file that claim");
      onFiled();
    } catch (err: any) {
      setError(err.message || "Couldn't file that claim");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !saving && !uploading) onClose();
      }}
    >
      <DialogContent
        className="grid max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0"
        /* No backdrop dismissal mid-claim: an upload may be in flight. */
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b border-border px-6 py-5 pr-12 text-left">
          <DialogTitle>Claim a reimbursement</DialogTitle>
          <DialogDescription>
            For money you spent on the chapter&apos;s behalf. Once approved it
            comes off what you owe. If you owe nothing, it&apos;s
            held as credit against your next dues.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={submit}
          className="contents"
          id="reimbursement-form"
        >
          <div className="space-y-4 overflow-y-auto px-6 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="reimb-amount">How much did you spend?</Label>
              <CurrencyInput
                id="reimb-amount"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reimb-what">What was it for?</Label>
              <Input
                id="reimb-what"
                type="text"
                placeholder="Pizza for rush night"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={200}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reimb-category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="reimb-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reimb-date">When you bought it</Label>
                <DatePicker
                  id="reimb-date"
                  value={purchasedOn}
                  maxDate={new Date()}
                  onChange={setPurchasedOn}
                  placeholder="Choose the day"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label asChild>
                <p>
                  Receipts{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional, but they get approved faster)
                  </span>
                </p>
              </Label>

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
                            onClick={() =>
                              setReceipts((current) =>
                                current.filter(
                                  (item) => item.url !== receipt.url
                                )
                              )
                            }
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

              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                accept="image/*,.pdf"
                onChange={attach}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={uploading || receipts.length >= 8}
              >
                {uploading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Paperclip aria-hidden="true" />
                )}
                {uploading ? "Uploading…" : "Attach a receipt"}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" role="alert">
                <CircleAlert aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="gap-2 border-t border-border px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={invalid || saving || uploading}>
              {saving && <LoadingSpinner size="sm" />}
              {saving ? "Sending…" : "Send to the treasurer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

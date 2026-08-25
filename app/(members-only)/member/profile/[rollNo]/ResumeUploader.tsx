// app/(members-only)/member/profile/[rollNo]/ResumeUploader.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  FileText,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ResumeUploaderProps {
  show: boolean;
  initialUrl?: string;
  onError: (msg: string) => void;
  onClose: () => void;
  targetRollNo?: string;
}

export default function ResumeUploader({
  show,
  onClose,
  onError,
  targetRollNo,
}: ResumeUploaderProps) {
  const maxBytes = 5 * 1024 * 1024;
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!show) return;
    setFile(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [show]);

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > maxBytes) {
      setFile(null);
      const message = "File too large. Max size is 5 MB.";
      setErrorMessage(message);
      onError(message);
      return;
    }
    setFile(f);
    setErrorMessage(null);
  };

  const clearSelection = () => {
    setFile(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    try {
      const presignRes = await fetch("/api/upload-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "presign",
          kind: "resume",
          filename: file.name,
          contentType: file.type,
          size: file.size,
          targetRollNo,
        }),
      });
      if (!presignRes.ok) {
        throw new Error(`Upload failed: ${await presignRes.text()}`);
      }
      const presignData = await presignRes.json();
      const uploadRes = await fetch(presignData.uploadUrl, {
        method: "PUT",
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${await uploadRes.text()}`);
      }
      const completeRes = await fetch("/api/upload-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          kind: "resume",
          key: presignData.key,
          targetRollNo,
        }),
      });
      if (!completeRes.ok) {
        throw new Error(`Upload failed: ${await completeRes.text()}`);
      }
      onClose();
      router.refresh();
    } catch (err: any) {
      const message = err.message || "Resume upload failed";
      setErrorMessage(message);
      onError(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open && !uploading) onClose();
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle>Upload résumé</DialogTitle>
          <DialogDescription>
            Replace your current résumé with a new document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="space-y-3">
            <Input
              ref={fileInputRef}
              id="resume-file"
              type="file"
              accept=".pdf,.doc,.docx"
              className="sr-only"
              onChange={onSelect}
              disabled={uploading}
            />

            {!file ? (
              <Label
                htmlFor="resume-file"
                className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-input bg-muted/20 px-6 py-8 text-center transition-colors hover:border-primary/60 hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Upload className="size-5" aria-hidden="true" />
                </span>
                <span className="space-y-1">
                  <span className="block text-sm font-semibold text-foreground">
                    Choose your résumé
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    PDF, DOC, or DOCX up to 5 MB
                  </span>
                </span>
              </Label>
            ) : (
              <div className="space-y-3">
                <Attachment aria-live="polite">
                  <AttachmentMedia className="bg-primary/10 text-primary">
                    {uploading ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <FileText aria-hidden="true" />
                    )}
                  </AttachmentMedia>
                  <AttachmentContent>
                    <AttachmentTitle>{file.name}</AttachmentTitle>
                    <AttachmentDescription>
                      {uploading
                        ? "Uploading…"
                        : `${(file.size / 1024 / 1024).toFixed(2)} MB · Ready to upload`}
                    </AttachmentDescription>
                  </AttachmentContent>
                  <AttachmentActions>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={clearSelection}
                      disabled={uploading}
                      aria-label={`Remove ${file.name}`}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </AttachmentActions>
                </Attachment>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <RefreshCw aria-hidden="true" />
                  Choose another file
                </Button>
              </div>
            )}
          </div>

          {errorMessage && (
            <Alert variant="destructive" aria-live="assertive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Résumé could not be uploaded</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="border-t border-border bg-background px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            aria-busy={uploading}
          >
            {uploading ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {uploading ? "Uploading…" : "Upload résumé"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

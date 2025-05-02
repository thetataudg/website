// app/(members-only)/member/profile/[rollNo]/ResumeUploader.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload } from "@fortawesome/free-solid-svg-icons";

interface ResumeUploaderProps {
  show: boolean;
  initialUrl?: string;
  onError: (msg: string) => void;
  onClose: () => void;
}

export default function ResumeUploader({
  show,
  initialUrl,
  onClose,
  onError,
}: ResumeUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("resume", file);

    try {
      const res = await fetch("/api/upload-file", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
      await res.json();
      onClose();
      router.refresh();
    } catch (err: any) {
      +onError(err.message || "Résumé upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!show) return null;

  return (
    <div
      className="modal fade show"
      style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Upload New Résumé</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <div className="mb-3">
              <label className="form-label">Select PDF or DOC/DOCX</label>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="form-control"
                onChange={onSelect}
              />
            </div>
            {file && <p>Will upload: {file.name}</p>}
          </div>

          <div className="modal-footer">
            <button
              className="btn btn-secondary"
              onClick={onClose}
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={!file || uploading}
            >
              {uploading ? (
                "Uploading…"
              ) : (
                <>
                  <FontAwesomeIcon icon={faUpload} className="me-1" />
                  Upload
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// app/(members-only)/member/profile/[rollNo]/PhotoUploader.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload } from "@fortawesome/free-solid-svg-icons";

interface PhotoUploaderProps {
  show: boolean;
  initialUrl?: string;
  onError: (msg: string) => void;
  onClose: () => void;
}

export default function PhotoUploader({
  show,
  initialUrl,
  onError,
  onClose,
}: PhotoUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(initialUrl || "");
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  // When the user selects a file, generate a preview
  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
  };

  // Upload only the 'photo' field
  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("photo", file);

    try {
      const res = await fetch("/api/upload-file", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
      await res.json();
      onClose();
      router.refresh();
    } catch (err: any) {
      onError(err.message || "Photo upload failed");
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
            <h5 className="modal-title">Edit Profile Picture</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body text-center">
            {preview && (
              <img
                src={preview}
                alt="Preview"
                className="rounded-circle mb-3"
                style={{
                  width: 120,
                  height: 120,
                  objectFit: "cover",
                }}
              />
            )}
            <input
              type="file"
              accept="image/*"
              className="form-control"
              onChange={onSelect}
            />
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

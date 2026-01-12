// app/(members-only)/member/profile/[rollNo]/PhotoUploader.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../../components/LoadingState";

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
  const maxBytes = 5 * 1024 * 1024;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(initialUrl || "");
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  // When the user selects a file, generate a preview
  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > maxBytes) {
      setFile(null);
      setPreview(initialUrl || "");
      onError("File too large. Max size is 5 MB.");
      return;
    }
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
  };

  // Upload only the 'photo' field
  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    try {
      const presignRes = await fetch("/api/upload-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "presign",
          kind: "photo",
          filename: file.name,
          contentType: file.type,
          size: file.size,
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
          kind: "photo",
          key: presignData.key,
        }),
      });
      if (!completeRes.ok) {
        throw new Error(`Upload failed: ${await completeRes.text()}`);
      }
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
            <div className="form-text">Max file size: 5 MB.</div>
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
                <>
                  <LoadingSpinner size="sm" className="me-2" />
                  Uploading...
                </>
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

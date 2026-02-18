// app/(members-only)/member/profile/[rollNo]/PhotoUploader.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../../components/LoadingState";

interface PhotoUploaderProps {
  show: boolean;
  initialUrl?: string;
  onError: (msg: string) => void;
  onClose: () => void;
  targetRollNo?: string;
}

export default function PhotoUploader({
  show,
  initialUrl,
  onError,
  onClose,
  targetRollNo,
}: PhotoUploaderProps) {
  const maxBytes = 5 * 1024 * 1024;
  const defaultOutputSize = 640;
  const objectUrlsRef = useRef<string[]>([]);

  const [rawFile, setRawFile] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(initialUrl || "");
  const [editorImage, setEditorImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [outputSize, setOutputSize] = useState(defaultOutputSize);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const router = useRouter();

  const trackObjectUrl = useCallback((blob: Blob | File) => {
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.push(url);
    return url;
  }, []);

  const clearObjectUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearObjectUrls();
  }, [clearObjectUrls]);

  useEffect(() => {
    if (!show) {
      clearObjectUrls();
      return;
    }
    setRawFile(null);
    setFile(null);
    setPreview(initialUrl || "");
    setEditorImage(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setOutputSize(defaultOutputSize);
    setCroppedAreaPixels(null);
  }, [clearObjectUrls, defaultOutputSize, initialUrl, show]);

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > maxBytes) {
      setRawFile(null);
      setFile(null);
      setPreview(initialUrl || "");
      setEditorImage(null);
      onError("File too large. Max size is 5 MB.");
      return;
    }
    if (f && !f.type.startsWith("image/")) {
      setRawFile(null);
      setFile(null);
      setPreview(initialUrl || "");
      setEditorImage(null);
      onError("Please select an image file.");
      return;
    }
    setRawFile(f);
    setFile(f);
    if (!f) {
      setPreview(initialUrl || "");
      setEditorImage(null);
      return;
    }

    const objectUrl = trackObjectUrl(f);
    setPreview(objectUrl);
    setEditorImage(objectUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setOutputSize(defaultOutputSize);
    setCroppedAreaPixels(null);
  };

  const loadImage = useCallback((src: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load selected image."));
      image.src = src;
    });
  }, []);

  const buildEditedFile = useCallback(
    async (source: string, area: Area, size: number) => {
      const image = await loadImage(source);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Your browser does not support image editing.");
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        image,
        area.x,
        area.y,
        area.width,
        area.height,
        0,
        0,
        size,
        size
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((value) => resolve(value), "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("Failed to process image.");

      const edited = new File([blob], "profile-photo.jpeg", {
        type: "image/jpeg",
      });
      if (edited.size > maxBytes) {
        throw new Error("Edited image is too large. Try a smaller resize value.");
      }
      return edited;
    },
    [loadImage, maxBytes]
  );

  const applyEdits = async () => {
    if (!editorImage || !croppedAreaPixels) return;
    setProcessing(true);
    try {
      const edited = await buildEditedFile(editorImage, croppedAreaPixels, outputSize);
      setFile(edited);
      setPreview(trackObjectUrl(edited));
    } catch (err: any) {
      onError(err?.message || "Failed to edit image.");
    } finally {
      setProcessing(false);
    }
  };

  const resetEdits = () => {
    if (!rawFile || !editorImage) return;
    setFile(rawFile);
    setPreview(editorImage);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setOutputSize(defaultOutputSize);
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
          kind: "photo",
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
          kind: "photo",
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
      onError(err.message || "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!show) return null;

  return (
    <div
      className="modal fade show photo-uploader-modal"
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
                className="photo-uploader__preview rounded-circle mb-3"
              />
            )}
            <input
              type="file"
              accept="image/*"
              className="form-control photo-uploader__file-input"
              onChange={onSelect}
              disabled={uploading || processing}
            />
            <div className="form-text photo-uploader__helper-text">
              Max file size: 5 MB. You can drag, zoom, crop, and resize before
              uploading.
            </div>

            {editorImage && (
              <div className="photo-editor mt-3 text-start">
                <div className="photo-editor__crop-frame">
                  <Cropper
                    image={editorImage}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_, areaPixels) =>
                      setCroppedAreaPixels(areaPixels)
                    }
                  />
                </div>

                <div className="photo-editor__group mt-3">
                  <label className="form-label photo-editor__label mb-1">
                    Zoom ({zoom.toFixed(2)}x)
                  </label>
                  <input
                    className="form-range photo-editor__range"
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    disabled={uploading || processing}
                  />
                </div>

                <div className="photo-editor__group mt-2">
                  <label className="form-label photo-editor__label mb-1">
                    Resize ({outputSize} x {outputSize}px)
                  </label>
                  <input
                    className="form-range photo-editor__range"
                    type="range"
                    min={256}
                    max={1024}
                    step={32}
                    value={outputSize}
                    onChange={(e) => setOutputSize(Number(e.target.value))}
                    disabled={uploading || processing}
                  />
                </div>

                <div className="photo-editor__actions d-flex gap-2 mt-3">
                  <button
                    type="button"
                    className="btn btn-sm photo-editor__btn photo-editor__btn--reset"
                    onClick={resetEdits}
                    disabled={uploading || processing || !rawFile}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    onClick={applyEdits}
                    disabled={uploading || processing || !croppedAreaPixels}
                  >
                    {processing ? (
                      <>
                        <LoadingSpinner size="sm" className="me-2" />
                        Applying...
                      </>
                    ) : (
                      "Apply Edits"
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="btn btn-secondary"
              onClick={onClose}
              disabled={uploading || processing}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={!file || uploading || processing}
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

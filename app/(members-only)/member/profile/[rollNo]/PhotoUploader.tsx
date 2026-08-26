// app/(members-only)/member/profile/[rollNo]/PhotoUploader.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Cropper, { type Area, type Point } from "react-easy-crop";
import {
  CircleAlert,
  Crop,
  ImagePlus,
  Loader2,
  RotateCcw,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Slider } from "@/components/ui/slider";

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  const reportError = useCallback(
    (message: string) => {
      setErrorMessage(message);
      onError(message);
    },
    [onError]
  );

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
    setEditorImage(initialUrl || null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setOutputSize(defaultOutputSize);
    setCroppedAreaPixels(null);
    setErrorMessage(null);
  }, [clearObjectUrls, defaultOutputSize, initialUrl, show]);

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > maxBytes) {
      setRawFile(null);
      setFile(null);
      setPreview(initialUrl || "");
      setEditorImage(initialUrl || null);
      reportError("File too large. Max size is 5 MB.");
      return;
    }
    if (f && !f.type.startsWith("image/")) {
      setRawFile(null);
      setFile(null);
      setPreview(initialUrl || "");
      setEditorImage(initialUrl || null);
      reportError("Please select an image file.");
      return;
    }
    setRawFile(f);
    setFile(f);
    setErrorMessage(null);
    if (!f) {
      setPreview(initialUrl || "");
      setEditorImage(initialUrl || null);
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
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(
          new Error(
            "Failed to load image for editing. If this is an existing photo, reselect it and try again."
          )
        );
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
      reportError(err?.message || "Failed to edit image.");
    } finally {
      setProcessing(false);
    }
  };

  const resetEdits = () => {
    if (!editorImage) return;
    setFile(rawFile);
    setPreview(rawFile ? editorImage : initialUrl || "");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setOutputSize(defaultOutputSize);
    setCroppedAreaPixels(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    try {
      // Send photos through our own API instead of uploading from the browser
      // directly to Garage. The latter requires the photo bucket to allow every
      // deployed web origin via CORS; the server-side path works consistently
      // for production, previews, and localhost.
      const form = new FormData();
      form.append("photo", file);
      if (targetRollNo) form.append("targetRollNo", targetRollNo);

      const uploadRes = await fetch("/api/upload-file", {
        method: "POST",
        body: form,
      });
      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${await uploadRes.text()}`);
      }
      onClose();
      router.refresh();
    } catch (err: any) {
      reportError(err.message || "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open && !uploading && !processing) onClose();
      }}
    >
      <DialogContent className="grid max-h-[92dvh] w-[calc(100%-2rem)] max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-5 pr-12">
          <DialogTitle>Edit profile photo</DialogTitle>
          <DialogDescription>
            Choose an image, position the crop, and preview it before uploading.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <Avatar className="size-24 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
              {preview ? <AvatarImage src={preview} alt="Profile photo preview" /> : null}
              <AvatarFallback>
                <ImagePlus className="size-8" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>

            <div className="space-y-2">
              <Label htmlFor="profile-photo-file">Choose a photo</Label>
              <Input
                id="profile-photo-file"
                type="file"
                accept="image/*"
                className="cursor-pointer file:cursor-pointer"
                onChange={onSelect}
                disabled={uploading || processing}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                JPG, PNG, or another image format up to 5 MB. The final image
                will be square.
              </p>
            </div>
          </div>

          {errorMessage && (
            <Alert variant="destructive" aria-live="assertive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Photo could not be updated</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {editorImage && (
            <section className="space-y-5 rounded-lg border border-border bg-muted/25 p-4">
              <div className="flex items-center gap-2">
                <Crop className="size-4 text-primary" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">
                  Crop and resize
                </h3>
              </div>

              <div className="relative h-[clamp(280px,48vh,520px)] overflow-hidden rounded-lg border border-border bg-black">
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

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="profile-photo-zoom">Zoom</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {zoom.toFixed(2)}×
                  </span>
                </div>
                <Slider
                  id="profile-photo-zoom"
                  min={1}
                  max={3}
                  step={0.01}
                  value={[zoom]}
                  onValueChange={([value]) => setZoom(value)}
                  disabled={uploading || processing}
                  aria-label="Photo zoom"
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="profile-photo-size">Output size</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {outputSize} × {outputSize}px
                  </span>
                </div>
                <Slider
                  id="profile-photo-size"
                  min={256}
                  max={1024}
                  step={32}
                  value={[outputSize]}
                  onValueChange={([value]) => setOutputSize(value)}
                  disabled={uploading || processing}
                  aria-label="Photo output size"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetEdits}
                  disabled={uploading || processing || !editorImage}
                >
                  <RotateCcw aria-hidden="true" />
                  Reset
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={applyEdits}
                  disabled={uploading || processing || !croppedAreaPixels}
                >
                  {processing ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Crop aria-hidden="true" />
                  )}
                  {processing ? "Applying…" : "Apply crop"}
                </Button>
              </div>
            </section>
          )}
        </div>

        <DialogFooter className="border-t border-border bg-background px-4 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={uploading || processing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading || processing}
            aria-busy={uploading}
          >
            {uploading ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            {uploading ? "Uploading…" : "Upload photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

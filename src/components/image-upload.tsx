"use client";

import * as React from "react";
import { cn } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Spinner } from "@/src/components/ui/spinner";
import { Camera, Upload, X } from "lucide-react";

interface ImageUploadProps {
  onImageCaptured: (
    file: File,
    geoLocation: { lat: number; lng: number } | null,
  ) => void;
  isProcessing: boolean;
}

export function ImageUpload({ onImageCaptured, isProcessing }: ImageUploadProps) {
  const [preview, setPreview] = React.useState<string | null>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = React.useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      setPreview(url);

      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            onImageCaptured(file, {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
          },
          () => {
            onImageCaptured(file, null);
          },
          { timeout: 5000, maximumAge: 60000 },
        );
      } else {
        onImageCaptured(file, null);
      }
    },
    [onImageCaptured],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearPreview = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
        disabled={isProcessing}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
        disabled={isProcessing}
      />

      {preview ? (
        <div className="relative">
          <div className="overflow-hidden rounded-lg border border-border">
            <img
              src={preview}
              alt="Captured vehicle"
              className="h-auto max-h-80 w-full object-contain bg-muted"
            />
          </div>
          {!isProcessing && (
            <button
              onClick={clearPreview}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {isProcessing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-black/40">
              <Spinner size="lg" className="text-white" />
              <p className="mt-3 text-sm font-medium text-white">
                Processing image…
              </p>
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border p-10",
            "bg-muted/50 transition-colors",
          )}
        >
          <div className="rounded-full bg-primary/10 p-4">
            <Camera className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Take a photo of the vehicle or upload an existing image
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => cameraInputRef.current?.click()}
              disabled={isProcessing}
            >
              <Camera className="mr-2 h-4 w-4" />
              Camera
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

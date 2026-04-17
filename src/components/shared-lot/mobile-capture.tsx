"use client";

import * as React from "react";
import { cn } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Camera, Upload, X } from "lucide-react";

interface MobileCaptureProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function MobileCapture({ onFileSelected, disabled }: MobileCaptureProps) {
  const [preview, setPreview] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const handleFile = React.useCallback(
    (next: File) => {
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(next);
      });
      setFile(next);
      onFileSelected(next);
    },
    [onFileSelected],
  );

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
  };

  React.useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="space-y-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {!preview ? (
        <div
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 p-6",
          )}
        >
          <p className="text-center text-sm text-muted-foreground">
            Take a photo of the number plate or choose from gallery
          </p>
          <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              type="button"
              className="flex-1"
              disabled={disabled}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="mr-2 h-4 w-4" />
              Camera
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-border">
          <img
            src={preview}
            alt="Plate"
            className="h-auto max-h-56 w-full object-contain bg-muted"
          />
          {!disabled && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-2 top-2 rounded-full bg-black/65 p-2 text-white"
              aria-label="Remove image"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {file && (
            <p className="truncate border-t border-border bg-card px-2 py-1 text-center text-xs text-muted-foreground">
              {file.name}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

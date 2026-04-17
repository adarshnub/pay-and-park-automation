"use client";

import * as React from "react";
import { cn } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Camera, Loader2, Upload, X } from "lucide-react";

interface MobileCaptureProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  /** Larger touch targets and copy for staff / shared-link flow. */
  variant?: "default" | "hero";
  /** Show scanning animation over the image preview (e.g. while OCR runs). */
  isProcessing?: boolean;
  /** Hide gallery upload; only camera capture (shared staff links). */
  cameraOnly?: boolean;
}

export function MobileCapture({
  onFileSelected,
  disabled,
  variant = "default",
  isProcessing = false,
  cameraOnly = false,
}: MobileCaptureProps) {
  const [preview, setPreview] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const hero = variant === "hero";
  const bigCamera = hero && cameraOnly;

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
    if (!cameraOnly && fileRef.current) fileRef.current.value = "";
  };

  React.useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  return (
    <div className={cn("space-y-3", hero && "space-y-4")}>
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
      {!cameraOnly && (
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
      )}

      {!preview ? (
        <div
          className={cn(
            "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/35 bg-primary/6 text-center",
            bigCamera
              ? "min-h-[min(78vw,380px)] gap-6 px-5 py-12 sm:min-h-[360px]"
              : hero
                ? "min-h-[min(72vw,320px)] gap-5 px-5 py-10 sm:min-h-[300px]"
                : "gap-3 rounded-xl border-border bg-muted/30 p-6",
          )}
        >
          {hero && (
            <div className="space-y-2">
              <p className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Scan the number plate
              </p>
              <p className="mx-auto max-w-sm text-base leading-snug text-muted-foreground sm:text-lg">
                {cameraOnly
                  ? "Use your device camera to photograph the plate clearly."
                  : "Use the camera for best results, or upload a photo from your gallery."}
              </p>
            </div>
          )}
          {!hero && (
            <p className="text-center text-sm text-muted-foreground">
              {cameraOnly
                ? "Take a photo of the number plate with your camera"
                : "Take a photo of the number plate or choose from gallery"}
            </p>
          )}
          <div
            className={cn(
              "flex w-full flex-col gap-3",
              bigCamera ? "max-w-lg sm:max-w-xl" : hero ? "max-w-md sm:max-w-lg" : "max-w-sm sm:flex-row sm:justify-center",
            )}
          >
            <Button
              type="button"
              className={cn(
                "w-full gap-3 font-semibold shadow-md",
                bigCamera
                  ? "min-h-22 py-6 text-2xl sm:min-h-24 sm:py-7 sm:text-3xl"
                  : hero
                    ? "min-h-15 text-lg sm:min-h-16 sm:text-xl"
                    : "flex-1",
              )}
              disabled={disabled}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera
                className={cn(
                  bigCamera ? "h-10 w-10 sm:h-12 sm:w-12" : hero ? "h-7 w-7 sm:h-8 sm:w-8" : "h-4 w-4",
                )}
                aria-hidden
              />
              Open camera
            </Button>
            {!cameraOnly && (
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "w-full gap-2 border-2 font-semibold",
                  hero ? "min-h-15 text-lg sm:min-h-16 sm:text-xl" : "flex-1",
                )}
                disabled={disabled}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className={cn(hero ? "h-7 w-7 sm:h-8 sm:w-8" : "h-4 w-4")} aria-hidden />
                Upload
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-border sm:rounded-2xl">
          <img
            src={preview}
            alt="Captured plate"
            className={cn(
              "h-auto w-full object-contain bg-muted",
              hero ? "max-h-72 sm:max-h-80" : "max-h-56",
              isProcessing && "scale-[1.01] motion-safe:transition-transform",
            )}
          />
          {isProcessing && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-end overflow-hidden rounded-[inherit] bg-slate-950/40 pb-8 pt-4 sm:pb-10"
              role="status"
              aria-live="polite"
              aria-label="Reading number plate from image"
            >
              <div className="plate-scan-sweep pointer-events-none absolute left-[-8%] right-[-8%] top-0 h-[26%] bg-linear-to-b from-transparent via-primary/85 to-transparent opacity-95 shadow-[0_0_28px_rgba(29,78,216,0.45)]" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/50 to-transparent" />
              <Loader2
                className="relative z-20 mb-3 h-10 w-10 animate-spin text-white drop-shadow-md sm:h-11 sm:w-11"
                aria-hidden
              />
              <p className="relative z-20 px-4 text-center text-base font-semibold tracking-wide text-white drop-shadow-md sm:text-lg">
                Reading plate…
              </p>
            </div>
          )}
          {!disabled && !isProcessing && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-3 top-3 z-20 rounded-full bg-black/70 p-2.5 text-white shadow-md ring-2 ring-white/20"
              aria-label="Remove image"
            >
              <X className={cn(hero ? "h-6 w-6" : "h-4 w-4")} />
            </button>
          )}
          {file && (
            <p className="truncate border-t border-border bg-card px-3 py-2 text-center text-sm text-muted-foreground">
              {file.name}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

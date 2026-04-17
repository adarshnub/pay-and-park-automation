"use client";

import * as React from "react";
import { cn } from "@/src/lib/utils";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Spinner } from "@/src/components/ui/spinner";
import { AlertTriangle, Check, X } from "lucide-react";
import type { OcrTokenUsage } from "@/src/lib/ocr/pipeline";
import { formatTokenUsageLine } from "@/src/lib/ocr/format-token-usage";

interface PlateReviewProps {
  imageUrl: string | null;
  croppedPlateUrl: string | null;
  detectedPlate: string;
  confidence: number | null;
  engineUsed: string | null;
  /** Set when the last cloud vision call returned usage metadata (same request as the plate). */
  tokenUsage?: OcrTokenUsage | null;
  action: "check_in" | "check_out";
  onConfirm: (confirmedPlate: string, wasEdited: boolean) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function getConfidenceBadge(confidence: number | null) {
  if (confidence === null) return { variant: "outline" as const, label: "N/A" };
  if (confidence > 80) return { variant: "success" as const, label: `${confidence}%` };
  if (confidence >= 50) return { variant: "warning" as const, label: `${confidence}%` };
  return { variant: "destructive" as const, label: `${confidence}%` };
}

export function PlateReview({
  imageUrl,
  croppedPlateUrl,
  detectedPlate,
  confidence,
  engineUsed,
  tokenUsage,
  action,
  onConfirm,
  onCancel,
  isSubmitting,
}: PlateReviewProps) {
  const [plate, setPlate] = React.useState(detectedPlate);
  const originalPlate = React.useRef(detectedPlate);

  React.useEffect(() => {
    setPlate(detectedPlate);
    originalPlate.current = detectedPlate;
  }, [detectedPlate]);

  const wasEdited = plate.trim() !== originalPlate.current;
  const isLowConfidence = confidence !== null && confidence < 50;
  const { variant: confVariant, label: confLabel } = getConfidenceBadge(confidence);

  const handleConfirm = () => {
    const trimmed = plate.trim().toUpperCase();
    if (!trimmed) return;
    onConfirm(trimmed, wasEdited);
  };

  return (
    <div className="flex flex-col gap-6">
      {imageUrl && (
        <div className="overflow-hidden rounded-lg border border-border">
          <img
            src={imageUrl}
            alt="Vehicle"
            className="h-auto max-h-72 w-full object-contain bg-muted"
          />
        </div>
      )}

      {croppedPlateUrl && (
        <div className="flex justify-center">
          <div className="overflow-hidden rounded-lg border-2 border-primary/30 bg-muted p-2">
            <img
              src={croppedPlateUrl}
              alt="Detected plate"
              className="h-16 w-auto object-contain"
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="plate-input" className="text-sm font-medium text-foreground">
            License Plate
          </label>
          <div className="flex items-center gap-2">
            {engineUsed && (
              <Badge variant="outline" className="text-xs">
                {engineUsed}
              </Badge>
            )}
            <Badge variant={confVariant}>
              Confidence: {confLabel}
            </Badge>
          </div>
        </div>
        <Input
          id="plate-input"
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          placeholder="Enter plate number"
          className={cn(
            "text-center text-2xl font-mono font-bold tracking-widest h-14",
            wasEdited && "ring-2 ring-warning",
          )}
          autoFocus
        />
        {wasEdited && (
          <p className="text-xs text-warning">
            Plate was manually edited (original: {originalPlate.current})
          </p>
        )}
        {tokenUsage && (
          <p className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Last model call:</span>{" "}
            <span className="font-mono">{formatTokenUsageLine(tokenUsage)}</span>
          </p>
        )}
      </div>

      {isLowConfidence && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Low Confidence Detection</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The OCR confidence is below 50%. Please carefully verify the plate number
              before confirming.
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={handleConfirm}
          disabled={isSubmitting || !plate.trim()}
        >
          {isSubmitting ? (
            <Spinner size="sm" className="mr-2 text-primary-foreground" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          {action === "check_in" ? "Confirm Check-In" : "Confirm Check-Out"}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { ImageUpload } from "@/src/components/image-upload";
import { PlateReview } from "@/src/components/plate-review";
import { lookupActiveVisit, confirmCheckOut, type CheckOutLookupResult } from "@/src/actions/visits";
import { formatPlateDisplay } from "@/src/lib/plate";
import type { OcrTokenUsage } from "@/src/lib/ocr/pipeline";
import { formatCurrency, formatDuration } from "@/src/lib/utils";
import {
  Camera,
  Keyboard,
  CheckCircle,
  AlertCircle,
  Clock,
  IndianRupee,
  Receipt,
} from "lucide-react";

type Step = "capture" | "review" | "visit-details" | "success" | "error";
type InputMode = "camera" | "manual";

export default function CheckOutPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-12 text-muted-foreground">Loading...</div>}>
      <CheckOutContent />
    </Suspense>
  );
}

function CheckOutContent() {
  const searchParams = useSearchParams();
  const prefillPlate = searchParams.get("plate") ?? "";

  const [step, setStep] = useState<Step>(prefillPlate ? "review" : "capture");
  const [inputMode, setInputMode] = useState<InputMode>("camera");
  const [manualPlate, setManualPlate] = useState(prefillPlate);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // OCR result state
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [detectedPlate, setDetectedPlate] = useState(prefillPlate);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [engineUsed, setEngineUsed] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<OcrTokenUsage | null>(null);
  const [croppedPlateUrl, setCroppedPlateUrl] = useState<string | null>(null);

  // Visit details state
  const [visitDetails, setVisitDetails] = useState<CheckOutLookupResult["visit"] | null>(null);
  const [confirmedPlate, setConfirmedPlate] = useState("");
  const [wasEdited, setWasEdited] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);

  async function handleImageCaptured(file: File, _geo: { lat: number; lng: number } | null) {
    setProcessing(true);
    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/ocr/process", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();

      const preview = URL.createObjectURL(file);
      setImageUrl(preview);
      setDetectedPlate(result.plate ?? "");
      setConfidence(result.confidence ?? null);
      setEngineUsed(result.engine ?? null);
      setTokenUsage(result.tokenUsage ?? null);
      setCroppedPlateUrl(result.croppedPlateUrl ?? null);
      setStep("review");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to process image");
      setStep("error");
    } finally {
      setProcessing(false);
    }
  }

  function handleManualSubmit() {
    if (!manualPlate.trim()) return;
    setDetectedPlate(manualPlate.trim().toUpperCase());
    setImageUrl(null);
    setCroppedPlateUrl(null);
    setConfidence(null);
    setEngineUsed(null);
    setTokenUsage(null);
    setStep("review");
  }

  async function handleConfirmPlate(plate: string, edited: boolean) {
    setSubmitting(true);
    setErrorMsg("");
    setConfirmedPlate(plate);
    setWasEdited(edited);

    try {
      const result = await lookupActiveVisit(plate);
      if (!result.success || !result.visit) {
        setErrorMsg(result.error ?? "No active visit found");
        setStep("error");
        return;
      }
      setVisitDetails(result.visit);
      setStep("visit-details");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Lookup failed");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckOut() {
    if (!visitDetails) return;
    setSubmitting(true);
    setErrorMsg("");

    try {
      const result = await confirmCheckOut(visitDetails.id, {
        confirmedPlate,
        rawDetectedPlate: detectedPlate || null,
        wasManuallyEdited: wasEdited,
        confidence,
      });

      if (!result.success) throw new Error(result.error);
      setReceiptNumber(result.receiptNumber ?? null);
      setStep("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Checkout failed");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setStep("capture");
    setInputMode("camera");
    setManualPlate("");
    setImageUrl(null);
    setDetectedPlate("");
    setConfidence(null);
    setEngineUsed(null);
    setTokenUsage(null);
    setCroppedPlateUrl(null);
    setVisitDetails(null);
    setConfirmedPlate("");
    setWasEdited(false);
    setReceiptNumber(null);
    setErrorMsg("");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vehicle Check-Out</h1>
        <p className="text-sm text-muted-foreground">
          Process a vehicle exit and generate invoice
        </p>
      </div>

      {step === "capture" && (
        <Card className="p-6">
          <div className="mb-4 flex gap-2">
            <Button
              variant={inputMode === "camera" ? "default" : "outline"}
              onClick={() => setInputMode("camera")}
              className="flex items-center gap-2"
            >
              <Camera className="h-4 w-4" />
              Upload Image
            </Button>
            <Button
              variant={inputMode === "manual" ? "default" : "outline"}
              onClick={() => setInputMode("manual")}
              className="flex items-center gap-2"
            >
              <Keyboard className="h-4 w-4" />
              Type Manually
            </Button>
          </div>

          {inputMode === "camera" && (
            <ImageUpload
              onImageCaptured={handleImageCaptured}
              isProcessing={processing}
            />
          )}

          {inputMode === "manual" && (
            <div className="space-y-4">
              <Input
                placeholder="e.g. KA 01 AB 1234"
                value={manualPlate}
                onChange={(e) => setManualPlate(e.target.value)}
              />
              <Button onClick={handleManualSubmit} disabled={!manualPlate.trim()}>
                Look Up Vehicle
              </Button>
            </div>
          )}
        </Card>
      )}

      {step === "review" && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Confirm Vehicle Plate</h2>
          <PlateReview
            imageUrl={imageUrl}
            croppedPlateUrl={croppedPlateUrl}
            detectedPlate={detectedPlate}
            confidence={confidence}
            engineUsed={engineUsed}
            tokenUsage={tokenUsage}
            action="check_out"
            onConfirm={handleConfirmPlate}
            onCancel={() => setStep("capture")}
            isSubmitting={submitting}
          />
        </Card>
      )}

      {step === "visit-details" && visitDetails && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Visit Summary</h2>
          <div className="space-y-3">
            <Row label="Plate" value={formatPlateDisplay(visitDetails.normalized_plate)} mono />
            <Row label="Parking Lot" value={visitDetails.parking_lot_name} />
            <Row
              label={<><Clock className="mr-1 inline h-3.5 w-3.5" />Check-in Time</>}
              value={new Date(visitDetails.check_in_at).toLocaleString()}
            />
            <Row label="Duration" value={formatDuration(visitDetails.duration_minutes)} />
            <Row label="Rate" value={`${formatCurrency(visitDetails.hourly_rate)}/hr`} />
            <Row label="Breakdown" value={visitDetails.breakdown} />
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="font-medium">
                <IndianRupee className="mr-1 inline h-4 w-4" />
                Amount Due
              </span>
              <span className="text-xl font-bold text-primary">
                {formatCurrency(visitDetails.final_amount)}
              </span>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Button onClick={handleCheckOut} disabled={submitting}>
              {submitting ? "Processing..." : "Confirm Check-Out"}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {step === "success" && (
        <Card className="p-6 text-center">
          <CheckCircle className="mx-auto mb-3 h-12 w-12 text-success" />
          <h2 className="text-lg font-semibold">Check-Out Complete</h2>
          {visitDetails && (
            <p className="mt-2 text-2xl font-bold text-primary">
              {formatCurrency(visitDetails.final_amount)}
            </p>
          )}
          {receiptNumber && (
            <p className="mt-1 flex items-center justify-center gap-1 text-sm text-muted-foreground">
              <Receipt className="h-3.5 w-3.5" />
              Receipt: {receiptNumber}
            </p>
          )}
          <Button onClick={handleReset} className="mt-4">
            Process Another Vehicle
          </Button>
        </Card>
      )}

      {step === "error" && (
        <Card className="p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-destructive" />
          <h2 className="text-lg font-semibold">Error</h2>
          <p className="mt-1 text-sm text-muted-foreground">{errorMsg}</p>
          <Button onClick={handleReset} className="mt-4">
            Try Again
          </Button>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: React.ReactNode;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? "font-mono font-medium" : ""}`}>{value}</span>
    </div>
  );
}

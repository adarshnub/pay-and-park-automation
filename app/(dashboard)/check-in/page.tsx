"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { ImageUpload } from "@/src/components/image-upload";
import { PlateReview } from "@/src/components/plate-review";
import { checkInVehicle } from "@/src/actions/visits";
import type { ParkingLot } from "@/src/lib/types";
import { Camera, Keyboard, CheckCircle, AlertCircle } from "lucide-react";

type Step = "select-lot" | "capture" | "review" | "success" | "error";
type InputMode = "camera" | "manual";

export default function CheckInPage() {
  const [step, setStep] = useState<Step>("select-lot");
  const [inputMode, setInputMode] = useState<InputMode>("camera");
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [manualPlate, setManualPlate] = useState("");
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // OCR result state
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [detectedPlate, setDetectedPlate] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [engineUsed, setEngineUsed] = useState<string | null>(null);
  const [croppedPlateUrl, setCroppedPlateUrl] = useState<string | null>(null);
  const [capturedGeo, setCapturedGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLots() {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("parking_lots")
          .select("*")
          .eq("is_active", true)
          .order("name");
        if (data) setLots(data as ParkingLot[]);
      } catch {
        // Supabase not configured yet
      }
    }
    fetchLots();
  }, []);

  function handleLotSelect() {
    if (!selectedLotId) return;
    setStep("capture");
  }

  async function handleImageCaptured(file: File, geo: { lat: number; lng: number } | null) {
    setCapturedFile(file);
    setCapturedGeo(geo);
    setProcessing(true);

    try {
      // Upload to Supabase Storage
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `check-in/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("vehicle-images")
        .upload(path, file, { contentType: file.type });

      let publicUrl: string | null = null;
      if (!uploadErr) {
        setStoragePath(path);
        const { data: urlData } = supabase.storage.from("vehicle-images").getPublicUrl(path);
        publicUrl = urlData.publicUrl;
      }

      // Call OCR API
      const formData = new FormData();
      formData.append("image", file);
      if (publicUrl) formData.append("imageUrl", publicUrl);

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
    setStep("review");
  }

  async function handleConfirmPlate(confirmedPlate: string, wasEdited: boolean) {
    setSubmitting(true);
    setErrorMsg("");

    try {
      const result = await checkInVehicle({
        parkingLotId: selectedLotId,
        confirmedPlate,
        rawDetectedPlate: detectedPlate || null,
        wasManuallyEdited: wasEdited,
        confidence,
        imageStoragePath: storagePath,
        latitude: capturedGeo?.lat ?? null,
        longitude: capturedGeo?.lng ?? null,
      });

      if (!result.success) throw new Error(result.error);
      setStep("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create visit");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setStep("select-lot");
    setInputMode("camera");
    setSelectedLotId("");
    setManualPlate("");
    setImageUrl(null);
    setDetectedPlate("");
    setConfidence(null);
    setEngineUsed(null);
    setCroppedPlateUrl(null);
    setCapturedGeo(null);
    setCapturedFile(null);
    setStoragePath(null);
    setErrorMsg("");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vehicle Check-In</h1>
        <p className="text-sm text-muted-foreground">
          Register a new vehicle entry
        </p>
      </div>

      {step === "select-lot" && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Select Parking Lot</h2>
          {lots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No parking lots available. Add lots in Settings first.
            </p>
          ) : (
            <div className="space-y-4">
              <select
                value={selectedLotId}
                onChange={(e) => setSelectedLotId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
              >
                <option value="">Choose a lot...</option>
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.name} ({lot.total_capacity} spots)
                  </option>
                ))}
              </select>
              <Button onClick={handleLotSelect} disabled={!selectedLotId}>
                Continue
              </Button>
            </div>
          )}
        </Card>
      )}

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
                Continue
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
            action="check_in"
            onConfirm={handleConfirmPlate}
            onCancel={() => setStep("capture")}
            isSubmitting={submitting}
          />
        </Card>
      )}

      {step === "success" && (
        <Card className="p-6 text-center">
          <CheckCircle className="mx-auto mb-3 h-12 w-12 text-success" />
          <h2 className="text-lg font-semibold">Vehicle Checked In</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The vehicle has been successfully registered.
          </p>
          <Button onClick={handleReset} className="mt-4">
            Check In Another Vehicle
          </Button>
        </Card>
      )}

      {step === "error" && (
        <Card className="p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-destructive" />
          <h2 className="text-lg font-semibold">Something Went Wrong</h2>
          <p className="mt-1 text-sm text-muted-foreground">{errorMsg}</p>
          <Button onClick={handleReset} className="mt-4">
            Try Again
          </Button>
        </Card>
      )}
    </div>
  );
}

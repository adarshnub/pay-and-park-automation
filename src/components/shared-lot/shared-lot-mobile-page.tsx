"use client";

import * as React from "react";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Spinner } from "@/src/components/ui/spinner";
import { LotStatsGrid, type LotStatsData } from "./lot-stats";
import { MobileCapture } from "./mobile-capture";
import { formatCurrency } from "@/src/lib/utils";
import { normalizePlate } from "@/src/lib/plate";
import { AlertTriangle, MapPin, RefreshCw } from "lucide-react";

interface ResolvePayload {
  linkName: string;
  lot: {
    id: string;
    name: string;
    address: string | null;
    total_capacity: number;
  };
  stats: LotStatsData;
}

interface VisitPreview {
  id: string;
  normalized_plate: string;
  check_in_at: string;
  duration_minutes: number;
  final_amount: number;
  breakdown: string;
  hourly_rate: number;
  minimum_charge: number;
}

export function SharedLotMobilePage({ token }: { token: string }) {
  const [resolve, setResolve] = React.useState<ResolvePayload | null>(null);
  const [resolveError, setResolveError] = React.useState("");
  const [loadingResolve, setLoadingResolve] = React.useState(true);

  const [plate, setPlate] = React.useState("");
  const [ocrPlate, setOcrPlate] = React.useState("");
  const [confidence, setConfidence] = React.useState<number | null>(null);
  const [engine, setEngine] = React.useState<string | null>(null);

  const [processingOcr, setProcessingOcr] = React.useState(false);
  const [lookupBusy, setLookupBusy] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState(false);

  const [visit, setVisit] = React.useState<VisitPreview | null>(null);
  const [lookupComplete, setLookupComplete] = React.useState(false);
  const [lookupError, setLookupError] = React.useState("");
  const [successMsg, setSuccessMsg] = React.useState("");
  const [disputePanel, setDisputePanel] = React.useState<{
    conflictingVisitId: string;
    otherParkingLotName: string;
    plate: string;
  } | null>(null);
  const [disputeNote, setDisputeNote] = React.useState("");
  const [disputeBusy, setDisputeBusy] = React.useState(false);

  const loadResolve = React.useCallback(async () => {
    setLoadingResolve(true);
    setResolveError("");
    try {
      const res = await fetch("/api/shared-lot/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setResolve(data as ResolvePayload);
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : "Failed to load");
      setResolve(null);
    } finally {
      setLoadingResolve(false);
    }
  }, [token]);

  React.useEffect(() => {
    loadResolve();
  }, [loadResolve]);

  async function onImageFile(file: File) {
    setProcessingOcr(true);
    setLookupError("");
    setSuccessMsg("");
    setVisit(null);
    setLookupComplete(false);
    setDisputePanel(null);
    setDisputeNote("");
    try {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("image", file);
      const res = await fetch("/api/shared-lot/process-image", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "OCR failed");
      const p = (data.plate ?? "").toString().toUpperCase();
      setPlate(p);
      setOcrPlate(p);
      setConfidence(typeof data.confidence === "number" ? data.confidence : null);
      setEngine(data.engine ?? null);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "OCR failed");
    } finally {
      setProcessingOcr(false);
    }
  }

  async function runLookup() {
    const trimmed = plate.trim().toUpperCase();
    if (!trimmed) {
      setLookupError("Enter or detect a plate number");
      return;
    }
    setLookupBusy(true);
    setLookupError("");
    setSuccessMsg("");
    setVisit(null);
    setLookupComplete(false);
    setDisputePanel(null);
    setDisputeNote("");
    try {
      const res = await fetch("/api/shared-lot/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, plate: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      if (data.error) throw new Error(data.error);
      if (data.hasActiveVisit && data.visit) {
        setVisit({
          id: data.visit.id,
          normalized_plate: data.visit.normalized_plate,
          check_in_at: data.visit.check_in_at,
          duration_minutes: data.visit.duration_minutes,
          final_amount: data.visit.final_amount,
          breakdown: data.visit.breakdown,
          hourly_rate: data.visit.hourly_rate,
          minimum_charge: data.visit.minimum_charge,
        });
      } else {
        setVisit(null);
      }
      setLookupComplete(true);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLookupBusy(false);
    }
  }

  const wasManuallyEdited =
    ocrPlate.length > 0 && normalizePlate(plate) !== normalizePlate(ocrPlate);

  async function doCheckIn() {
    const trimmed = plate.trim().toUpperCase();
    if (!trimmed) return;
    setActionBusy(true);
    setLookupError("");
    setSuccessMsg("");
    setDisputePanel(null);
    setDisputeNote("");
    try {
      const res = await fetch("/api/shared-lot/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          plate: trimmed,
          rawDetectedPlate: ocrPlate || null,
          confidence,
          wasManuallyEdited,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "CHECKED_IN_ELSEWHERE" && data.conflictingVisitId) {
          setDisputePanel({
            conflictingVisitId: data.conflictingVisitId,
            otherParkingLotName: String(data.otherParkingLotName ?? "Another lot"),
            plate: trimmed,
          });
          return;
        }
        throw new Error(data.error ?? "Check-in failed");
      }
      setSuccessMsg(`Checked in ${trimmed}`);
      setPlate("");
      setOcrPlate("");
      setConfidence(null);
      setEngine(null);
      setVisit(null);
      setLookupComplete(false);
      await loadResolve();
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Check-in failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function submitDispute() {
    if (!disputePanel) return;
    setDisputeBusy(true);
    setLookupError("");
    try {
      const res = await fetch("/api/shared-lot/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          plate: disputePanel.plate,
          conflictingVisitId: disputePanel.conflictingVisitId,
          note: disputeNote.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit dispute");
      setSuccessMsg("Dispute submitted. Management can review it in your records.");
      setDisputePanel(null);
      setDisputeNote("");
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Dispute failed");
    } finally {
      setDisputeBusy(false);
    }
  }

  async function doCheckoutConfirm() {
    if (!visit) return;
    const trimmed = plate.trim().toUpperCase();
    setActionBusy(true);
    setLookupError("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/shared-lot/checkout-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          visitId: visit.id,
          plate: trimmed,
          rawDetectedPlate: ocrPlate || null,
          confidence,
          wasManuallyEdited,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      setSuccessMsg(`Checked out · Receipt ${data.receiptNumber ?? ""}`);
      setPlate("");
      setOcrPlate("");
      setConfidence(null);
      setEngine(null);
      setVisit(null);
      setLookupComplete(false);
      await loadResolve();
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setActionBusy(false);
    }
  }

  if (loadingResolve) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6">
        <Spinner size="lg" />
        <p className="text-sm text-muted-foreground">Loading lot…</p>
      </div>
    );
  }

  if (resolveError || !resolve) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-destructive">{resolveError || "Link invalid"}</p>
        <Button variant="outline" className="mt-4" onClick={() => loadResolve()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-10 pt-4">
      <header className="mb-4 space-y-1">
        <Badge variant="secondary" className="text-xs">
          Staff link
        </Badge>
        <h1 className="text-xl font-bold leading-tight">{resolve.lot.name}</h1>
        {resolve.lot.address && (
          <p className="flex items-start gap-1 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {resolve.lot.address}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{resolve.linkName}</p>
      </header>

      <LotStatsGrid stats={resolve.stats} />

      <Card className="mt-4 space-y-4 p-4">
        <h2 className="text-sm font-semibold">Scan plate</h2>
        <MobileCapture onFileSelected={onImageFile} disabled={processingOcr || actionBusy} />
        {processingOcr && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" />
            Reading plate…
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Plate number</label>
          <Input
            value={plate}
            onChange={(e) => {
              setPlate(e.target.value.toUpperCase());
              setLookupComplete(false);
              setDisputePanel(null);
            }}
            placeholder="e.g. KL01AA9100"
            className="text-center font-mono text-lg font-bold tracking-wider"
            disabled={actionBusy}
          />
          <div className="flex flex-wrap gap-2">
            {engine && (
              <Badge variant="outline" className="text-[10px]">
                {engine}
              </Badge>
            )}
            {confidence != null && (
              <Badge variant="outline" className="text-[10px]">
                {confidence}% confidence
              </Badge>
            )}
          </div>
        </div>

        <Button
          className="w-full"
          variant="secondary"
          onClick={runLookup}
          disabled={lookupBusy || !plate.trim() || actionBusy}
        >
          {lookupBusy ? <Spinner size="sm" className="text-primary-foreground" /> : "Look up vehicle"}
        </Button>

        {lookupError && (
          <p className="text-sm text-destructive">{lookupError}</p>
        )}
        {successMsg && (
          <p className="text-sm text-success">{successMsg}</p>
        )}

        {disputePanel && (
          <div className="space-y-3 rounded-lg border border-warning/35 bg-warning/10 p-3">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div className="min-w-0 space-y-1 text-sm">
                <p className="font-semibold text-foreground">Checked in at a different lot</p>
                <p className="text-muted-foreground">
                  Plate{" "}
                  <span className="font-mono font-bold text-foreground">{disputePanel.plate}</span> still
                  has an active session at{" "}
                  <span className="font-medium text-foreground">{disputePanel.otherParkingLotName}</span>.
                  You cannot check it in here until that is resolved.
                </p>
                <p className="text-xs text-muted-foreground">
                  If you believe the system is wrong, submit a short note below. Management can review it in
                  the dashboard.
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="dispute-note" className="text-xs font-medium text-muted-foreground">
                Note for management (optional)
              </label>
              <textarea
                id="dispute-note"
                value={disputeNote}
                onChange={(e) => setDisputeNote(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
                placeholder="e.g. Customer says they left the other lot an hour ago…"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disputeBusy}
                onClick={() => {
                  setDisputePanel(null);
                  setDisputeNote("");
                }}
              >
                Dismiss
              </Button>
              <Button type="button" size="sm" disabled={disputeBusy} onClick={submitDispute}>
                {disputeBusy ? <Spinner size="sm" className="text-primary-foreground" /> : "Submit dispute"}
              </Button>
            </div>
          </div>
        )}

        {!visit && lookupComplete && plate.trim() && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">No active visit at this lot</p>
            <p className="mt-1 text-sm">You can check this vehicle in.</p>
            <Button className="mt-3 w-full" onClick={doCheckIn} disabled={actionBusy}>
              {actionBusy ? <Spinner size="sm" className="text-primary-foreground" /> : "Check in"}
            </Button>
          </div>
        )}

        {visit && (
          <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Checkout preview</p>
            <p className="font-mono text-lg font-bold">{visit.normalized_plate}</p>
            <p className="text-xs text-muted-foreground">
              In since {new Date(visit.check_in_at).toLocaleString()}
            </p>
            <p className="text-sm">
              Duration: <strong>{visit.duration_minutes} min</strong>
            </p>
            <p className="text-lg font-bold text-success">
              {formatCurrency(visit.final_amount)}
            </p>
            <p className="text-xs text-muted-foreground">{visit.breakdown}</p>
            <Button className="w-full" onClick={doCheckoutConfirm} disabled={actionBusy}>
              {actionBusy ? <Spinner size="sm" className="text-primary-foreground" /> : "Confirm check out"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

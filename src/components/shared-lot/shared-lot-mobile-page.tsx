"use client";

import * as React from "react";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import { Spinner } from "@/src/components/ui/spinner";
import type { LotStatsData } from "./lot-stats";
import { MobileCapture } from "./mobile-capture";
import {
  cn,
  formatCurrency,
  formatCheckInDateTimeDisplay,
  formatDuration,
} from "@/src/lib/utils";
import { normalizePlate } from "@/src/lib/plate";
import { AlertTriangle, Check, MapPin, RefreshCw } from "lucide-react";

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

  const [processingOcr, setProcessingOcr] = React.useState(false);
  const [lookupBusy, setLookupBusy] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState(false);

  const [visit, setVisit] = React.useState<VisitPreview | null>(null);
  const [lookupComplete, setLookupComplete] = React.useState(false);
  const [lookupError, setLookupError] = React.useState("");
  const [successMsg, setSuccessMsg] = React.useState("");
  /** Full-screen payment-style confirmation after check-in / check-out. */
  const [successFlash, setSuccessFlash] = React.useState<
    null | { kind: "checkin" } | { kind: "checkout"; receipt?: string }
  >(null);
  const [disputePanel, setDisputePanel] = React.useState<{
    conflictingVisitId: string;
    otherParkingLotName: string;
    plate: string;
  } | null>(null);
  const [disputeNote, setDisputeNote] = React.useState("");
  const [disputeBusy, setDisputeBusy] = React.useState(false);
  /** After lookup finds an active visit: false = only big Check out; true = bill + complete payment. */
  const [checkoutDetailsOpen, setCheckoutDetailsOpen] = React.useState(false);

  React.useEffect(() => {
    if (!visit) setCheckoutDetailsOpen(false);
  }, [visit?.id]);

  React.useEffect(() => {
    if (!checkoutDetailsOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [checkoutDetailsOpen]);

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

  React.useEffect(() => {
    if (!successFlash) return;
    const id = window.setTimeout(() => setSuccessFlash(null), 3200);
    return () => window.clearTimeout(id);
  }, [successFlash]);

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

      const trimmed = p.trim().toUpperCase();
      setProcessingOcr(false);
      if (trimmed) {
        await runLookup(trimmed);
      }
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "OCR failed");
    } finally {
      setProcessingOcr(false);
    }
  }

  async function runLookup(plateOverride?: string) {
    const trimmed = (plateOverride ?? plate).trim().toUpperCase();
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
      setSuccessMsg("");
      setSuccessFlash({ kind: "checkin" });
      setPlate("");
      setOcrPlate("");
      setConfidence(null);
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
      setSuccessMsg("");
      setSuccessFlash({
        kind: "checkout",
        receipt: data.receiptNumber ? String(data.receiptNumber) : undefined,
      });
      setPlate("");
      setOcrPlate("");
      setConfidence(null);
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
    <div className="mx-auto min-h-screen max-w-lg px-4 pb-12 pt-4">
      {visit && checkoutDetailsOpen && (
        <div
          className="fixed inset-0 z-90 flex min-h-0 flex-col bg-blue-600 text-white"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-sheet-title"
        >
          <div className="mx-auto flex w-full max-w-lg shrink-0 items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
            <p
              id="checkout-sheet-title"
              className="text-xs font-semibold uppercase tracking-wide text-blue-100"
            >
              Checkout &amp; payment
            </p>
            <button
              type="button"
              className="shrink-0 text-sm font-medium text-white underline-offset-4 hover:underline disabled:opacity-50"
              onClick={() => setCheckoutDetailsOpen(false)}
              disabled={actionBusy}
            >
              Back
            </button>
          </div>

          <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-4">
            <p className="text-center font-mono text-2xl font-bold tracking-wide text-white sm:text-3xl">
              {visit.normalized_plate}
            </p>
            <div className="mt-4 space-y-4 rounded-2xl bg-white/95 p-4 text-foreground shadow-xl ring-1 ring-white/20 sm:p-5">
              <div className="rounded-xl border border-border bg-card px-4 py-4 text-center shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Check-in time
                </p>
                <p className="mt-2 text-sm font-medium leading-snug text-foreground sm:text-base">
                  {formatCheckInDateTimeDisplay(visit.check_in_at).dateLine}
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-primary sm:text-4xl">
                  {formatCheckInDateTimeDisplay(visit.check_in_at).timeLine}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card px-4 py-4 text-center shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Time in lot
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
                  {formatDuration(visit.duration_minutes)}
                </p>
              </div>
              <p className="text-center text-xl font-bold text-foreground sm:text-2xl">
                Amount due: {formatCurrency(visit.final_amount)}
              </p>
              <p className="text-center text-xs leading-snug text-muted-foreground sm:text-sm">
                {visit.breakdown}
              </p>
            </div>
          </div>

          <div className="mx-auto w-full max-w-lg shrink-0 border-t border-blue-400/30 bg-blue-800/40 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
            <Button
              type="button"
              variant="secondary"
              className={cn(
                "h-auto min-h-18 w-full rounded-2xl px-4 py-4 text-center text-lg font-bold shadow-[0_12px_40px_-8px_rgba(0,0,0,0.45)] ring-2 ring-white/25 transition-[transform,box-shadow] hover:bg-blue-50 hover:shadow-[0_14px_44px_-8px_rgba(0,0,0,0.5)] active:scale-[0.99] sm:min-h-20 sm:text-xl",
                "border-0 bg-white text-blue-950 hover:text-blue-950 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-900",
                "disabled:opacity-60",
              )}
              size="lg"
              onClick={() => void doCheckoutConfirm()}
              disabled={actionBusy}
            >
              {actionBusy ? (
                <span className="flex w-full items-center justify-center py-1">
                  <Spinner size="lg" className="text-blue-700" />
                </span>
              ) : (
                "Complete checkout"
              )}
            </Button>
          </div>
        </div>
      )}

      {successFlash && (
        <button
          type="button"
          className={cn(
            "fixed inset-0 z-100 flex cursor-default flex-col items-center justify-center p-6 text-white outline-none",
            successFlash.kind === "checkin" ? "bg-emerald-600" : "bg-blue-600",
          )}
          onClick={() => setSuccessFlash(null)}
          aria-label="Dismiss success confirmation"
        >
          <div
            className={cn(
              "mb-8 flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-white shadow-xl ring-4 sm:h-28 sm:w-28",
              successFlash.kind === "checkin"
                ? "text-emerald-600 ring-emerald-400/40"
                : "text-blue-600 ring-blue-400/40",
            )}
            aria-hidden
          >
            <Check className="h-14 w-14 sm:h-16 sm:w-16" strokeWidth={2.75} />
          </div>
          <p className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            {successFlash.kind === "checkin" ? "Check-in successful" : "Checkout complete"}
          </p>
          {successFlash.kind === "checkout" && (
            <p className="mt-2 max-w-sm px-2 text-center text-base text-blue-50 sm:text-lg">
              Payment recorded and vehicle checked out.
            </p>
          )}
          {successFlash.kind === "checkout" && successFlash.receipt && (
            <p className="mt-4 text-center text-lg text-blue-50">
              Receipt <span className="font-mono font-semibold">{successFlash.receipt}</span>
            </p>
          )}
          <p
            className={cn(
              "mt-10 max-w-xs text-center text-sm",
              successFlash.kind === "checkin" ? "text-emerald-100/95" : "text-blue-100/95",
            )}
          >
            Tap anywhere to continue
          </p>
        </button>
      )}

      <header className="mb-3 space-y-1">
        <Badge variant="secondary" className="text-xs">
          Staff link
        </Badge>
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">{resolve.lot.name}</h1>
        {resolve.lot.address && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {resolve.lot.address}
          </p>
        )}
      </header>

      <Card className="mt-4 space-y-5 border-border/80 p-5 shadow-md sm:mt-5 sm:p-6">
        <MobileCapture
          variant="hero"
          cameraOnly
          isProcessing={processingOcr}
          onFileSelected={onImageFile}
          disabled={processingOcr || actionBusy}
        />

        <div className="space-y-3">
          <label className="text-base font-bold text-foreground sm:text-lg">Plate number</label>
          <Input
            value={plate}
            onChange={(e) => {
              setPlate(e.target.value.toUpperCase());
              setLookupComplete(false);
              setDisputePanel(null);
            }}
            placeholder="e.g. KL01AA9100"
            className="min-h-17 rounded-xl border-2 px-4 py-4 text-center font-mono text-2xl font-bold tracking-wider placeholder:text-base sm:min-h-19 sm:text-3xl sm:placeholder:text-lg"
            disabled={actionBusy}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <Button
          className="min-h-17 w-full rounded-xl text-lg font-bold sm:min-h-19 sm:text-xl"
          size="lg"
          variant="secondary"
          onClick={() => void runLookup()}
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
            <Button
              className="min-h-14 w-full text-lg font-semibold"
              size="lg"
              onClick={doCheckIn}
              disabled={actionBusy}
            >
              {actionBusy ? <Spinner size="sm" className="text-primary-foreground" /> : "Check in"}
            </Button>
          </div>
        )}

        {visit && !checkoutDetailsOpen && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <Button
              className="min-h-17 w-full rounded-xl text-lg font-bold shadow-md sm:min-h-19 sm:text-xl"
              size="lg"
              onClick={() => setCheckoutDetailsOpen(true)}
              disabled={actionBusy}
            >
              Check out
            </Button>
          </div>
        )}

      </Card>
    </div>
  );
}

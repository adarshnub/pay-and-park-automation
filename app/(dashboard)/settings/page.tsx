"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { createClient } from "@/src/lib/supabase/client";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { updateOrganization, addParkingLot, updateRatePlan } from "@/src/actions/settings";
import { Plus, Trash2, Save, Building2 } from "lucide-react";
import type { ParkingLot, RatePlan } from "@/src/lib/types";

interface OrgForm { name: string }
interface LotForm { name: string; address: string; total_capacity: number }
interface RateForm { hourly_rate: number; minimum_charge: number; grace_period_minutes: number; daily_cap: number }

export default function SettingsPage() {
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const orgForm = useForm<OrgForm>({ defaultValues: { name: "" } });
  const lotForm = useForm<LotForm>({ defaultValues: { name: "", address: "", total_capacity: 50 } });
  const rateForm = useForm<RateForm>({
    defaultValues: { hourly_rate: 50, minimum_charge: 20, grace_period_minutes: 15, daily_cap: 0 },
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const supabase = createClient();
        const { data: orgData } = await supabase
          .from("organizations")
          .select("name")
          .limit(1)
          .maybeSingle();
        if (orgData) orgForm.reset({ name: orgData.name });

        const { data: lotsData } = await supabase
          .from("parking_lots")
          .select("*")
          .eq("is_active", true)
          .order("name");
        if (lotsData && lotsData.length > 0) {
          setLots(lotsData as ParkingLot[]);
          setSelectedLotId(lotsData[0].id);
          await loadRatePlan(lotsData[0].id);
        }
      } catch {
        // Supabase not configured
      }
    }
    loadSettings();
  }, []);

  async function loadRatePlan(lotId: string) {
    try {
      const supabase = createClient();
      const { data: rateData } = await supabase
        .from("rate_plans")
        .select("*")
        .eq("parking_lot_id", lotId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (rateData) {
        rateForm.reset({
          hourly_rate: rateData.hourly_rate,
          minimum_charge: rateData.minimum_charge,
          grace_period_minutes: rateData.grace_period_minutes,
          daily_cap: rateData.daily_cap ?? 0,
        });
      }
    } catch { /* ignore */ }
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 3000);
  }
  function showError(msg: string) {
    setErrorMsg(msg);
    setSuccessMsg(null);
  }

  async function saveOrgName(data: OrgForm) {
    setSaving("org");
    const result = await updateOrganization(data.name);
    if (result.success) showSuccess("Organization name updated.");
    else showError(result.error ?? "Failed to update");
    setSaving(null);
  }

  async function handleAddLot(data: LotForm) {
    setSaving("lot");
    const result = await addParkingLot({
      name: data.name,
      address: data.address,
      totalCapacity: data.total_capacity,
    });
    if (result.success) {
      showSuccess("Parking lot added.");
      lotForm.reset();
      // Reload lots
      const supabase = createClient();
      const { data: lotsData } = await supabase.from("parking_lots").select("*").eq("is_active", true).order("name");
      if (lotsData) setLots(lotsData as ParkingLot[]);
    } else {
      showError(result.error ?? "Failed to add lot");
    }
    setSaving(null);
  }

  async function deleteLot(id: string) {
    try {
      const supabase = createClient();
      await supabase.from("parking_lots").update({ is_active: false }).eq("id", id);
      setLots((prev) => prev.filter((l) => l.id !== id));
      showSuccess("Lot removed.");
    } catch { showError("Failed to delete lot"); }
  }

  async function saveRatePlanForm(data: RateForm) {
    if (!selectedLotId) return;
    setSaving("rate");
    const result = await updateRatePlan({
      parkingLotId: selectedLotId,
      hourlyRate: data.hourly_rate,
      minimumCharge: data.minimum_charge,
      gracePeriodMinutes: data.grace_period_minutes,
      dailyCap: data.daily_cap || null,
    });
    if (result.success) showSuccess("Rate plan saved.");
    else showError(result.error ?? "Failed to save rate plan");
    setSaving(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your organization and parking configuration
        </p>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-success/10 px-4 py-2 text-sm font-medium text-success">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
          {errorMsg}
        </div>
      )}

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Organization</h2>
        <form onSubmit={orgForm.handleSubmit(saveOrgName)} className="flex gap-3">
          <Input placeholder="Organization name" {...orgForm.register("name", { required: true })} className="flex-1" />
          <Button type="submit" disabled={saving === "org"}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving === "org" ? "Saving..." : "Save"}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Parking Lots</h2>
        {lots.length > 0 && (
          <div className="mb-4 space-y-2">
            {lots.map((lot) => (
              <div key={lot.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{lot.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {lot.total_capacity} spots{lot.address ? ` · ${lot.address}` : ""}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteLot(lot.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={lotForm.handleSubmit(handleAddLot)} className="space-y-3 rounded-lg border border-dashed border-border p-4">
          <p className="text-sm font-medium text-muted-foreground">Add New Lot</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input placeholder="Lot name" {...lotForm.register("name", { required: true })} />
            <Input placeholder="Address (optional)" {...lotForm.register("address")} />
            <Input type="number" placeholder="Capacity" {...lotForm.register("total_capacity", { valueAsNumber: true, min: 1 })} />
          </div>
          <Button type="submit" variant="outline" disabled={saving === "lot"}>
            <Plus className="mr-1.5 h-4 w-4" />
            {saving === "lot" ? "Adding..." : "Add Lot"}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">Rate Plan</h2>
        {lots.length > 0 && (
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium">Select Lot</label>
            <select
              value={selectedLotId ?? ""}
              onChange={(e) => { setSelectedLotId(e.target.value); loadRatePlan(e.target.value); }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              {lots.map((lot) => (
                <option key={lot.id} value={lot.id}>{lot.name}</option>
              ))}
            </select>
          </div>
        )}
        <form onSubmit={rateForm.handleSubmit(saveRatePlanForm)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Hourly Rate (INR)</label>
              <Input type="number" {...rateForm.register("hourly_rate", { valueAsNumber: true, min: 0 })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Minimum Charge (INR)</label>
              <Input type="number" {...rateForm.register("minimum_charge", { valueAsNumber: true, min: 0 })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Grace Period (minutes)</label>
              <Input type="number" {...rateForm.register("grace_period_minutes", { valueAsNumber: true, min: 0 })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Daily Cap (INR, 0 = none)</label>
              <Input type="number" {...rateForm.register("daily_cap", { valueAsNumber: true, min: 0 })} />
            </div>
          </div>
          <Button type="submit" disabled={saving === "rate" || !selectedLotId}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving === "rate" ? "Saving..." : "Save Rate Plan"}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold">OpenAI API Key</h2>
        <p className="text-sm text-muted-foreground">
          Set the <code className="rounded bg-muted px-1 text-xs">OPENAI_API_KEY</code> environment variable
          on your server to enable OpenAI Vision fallback for OCR. This cannot be configured from the dashboard
          for security reasons.
        </p>
      </Card>
    </div>
  );
}

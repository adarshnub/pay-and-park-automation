"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { createClient } from "@/src/lib/supabase/client";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  updateOrganization,
  addParkingLot,
  updateRatePlan,
  listLotShareLinks,
  listAllOrgShareLinks,
  createLotShareLink,
  revokeLotShareLink,
  rotateLotShareLinkToken,
  type LotShareLinkSummary,
} from "@/src/actions/settings";
import { Plus, Trash2, Save, Building2, Link2, Ban, Copy, X } from "lucide-react";
import type { ParkingLot, RatePlan } from "@/src/lib/types";

/** Match server: prefer public env base, then current origin (path-only links from API). */
function toAbsoluteShareUrl(linkUrl: string, baseUrlMissing: boolean): string {
  if (!baseUrlMissing) return linkUrl;
  const path = linkUrl.startsWith("/") ? linkUrl : `/${linkUrl}`;
  const fromEnv =
    process.env.NEXT_PUBLIC_SHAREABLE_LINK_BASE_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "";
  if (typeof window !== "undefined") {
    return `${fromEnv || window.location.origin}${path}`;
  }
  return path;
}

interface OrgForm { name: string }
interface LotForm { name: string; address: string; total_capacity: number }
interface RateForm { hourly_rate: number; minimum_charge: number; grace_period_minutes: number; daily_cap: number }

export default function SettingsPage() {
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shareLinks, setShareLinks] = useState<LotShareLinkSummary[]>([]);
  /** All links in org, for parking-lot list (includes parking_lot_id) */
  const [allOrgShareLinks, setAllOrgShareLinks] = useState<LotShareLinkSummary[]>([]);
  const [loadingShareLinks, setLoadingShareLinks] = useState(false);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  /** Full URL shown once after create — copyable in UI */
  const [pendingShareUrl, setPendingShareUrl] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);

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
          await loadShareLinks(lotsData[0].id);
          await loadAllOrgShareLinks();
        }
      } catch {
        // Supabase not configured
      }
    }
    loadSettings();
  }, []);

  useEffect(() => {
    setPendingShareUrl(null);
    setCopyDone(false);
  }, [selectedLotId]);

  async function loadShareLinks(lotId: string) {
    setLoadingShareLinks(true);
    const result = await listLotShareLinks(lotId);
    if (result.success && result.links) setShareLinks(result.links);
    else setShareLinks([]);
    setLoadingShareLinks(false);
  }

  async function loadAllOrgShareLinks() {
    const result = await listAllOrgShareLinks();
    if (result.success && result.links) setAllOrgShareLinks(result.links);
    else setAllOrgShareLinks([]);
  }

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
      if (lotsData) {
        setLots(lotsData as ParkingLot[]);
        await loadAllOrgShareLinks();
      }
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
      setAllOrgShareLinks((prev) => prev.filter((l) => l.parking_lot_id !== id));
      showSuccess("Lot removed.");
    } catch { showError("Failed to delete lot"); }
  }

  async function handleCreateShareLink() {
    if (!selectedLotId) return;
    setSaving("sharelink");
    const result = await createLotShareLink({
      parkingLotId: selectedLotId,
      name: newLinkLabel.trim() || undefined,
    });
    if (result.success && result.linkUrl && result.token) {
      const absolute = toAbsoluteShareUrl(
        result.linkUrl,
        Boolean(result.baseUrlMissing),
      );
      setPendingShareUrl(absolute);
      setCopyDone(false);
      try {
        await navigator.clipboard.writeText(absolute);
      } catch {
        /* user can copy from the field */
      }
      showSuccess("Staff link created. Copy it below — the full URL is not stored.");
      setNewLinkLabel("");
      await loadShareLinks(selectedLotId);
      await loadAllOrgShareLinks();
    } else {
      showError(result.error ?? "Failed to create link");
    }
    setSaving(null);
  }

  async function handleCopyRenewShareLink(linkId: string) {
    const ok = window.confirm(
      "A new shareable URL will be created and copied. Anyone using the old link will lose access. Continue?",
    );
    if (!ok) return;
    setSaving(`copy-${linkId}`);
    const result = await rotateLotShareLinkToken(linkId);
    if (result.success && result.linkUrl) {
      const absolute = toAbsoluteShareUrl(
        result.linkUrl,
        Boolean(result.baseUrlMissing),
      );
      setPendingShareUrl(absolute);
      setCopyDone(false);
      try {
        await navigator.clipboard.writeText(absolute);
      } catch {
        /* field below */
      }
      showSuccess("New link copied. The previous URL no longer works.");
      if (selectedLotId) await loadShareLinks(selectedLotId);
      await loadAllOrgShareLinks();
    } else {
      showError(result.error ?? "Could not create link");
    }
    setSaving(null);
  }

  async function handleRevokeShareLink(linkId: string) {
    if (!selectedLotId) return;
    const result = await revokeLotShareLink(linkId);
    if (result.success) {
      showSuccess("Link revoked.");
      await loadShareLinks(selectedLotId);
      await loadAllOrgShareLinks();
    } else showError(result.error ?? "Failed to revoke");
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
            {lots.map((lot) => {
              const lotLinks = allOrgShareLinks.filter((l) => l.parking_lot_id === lot.id);
              return (
                <div key={lot.id} className="rounded-lg border border-border px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{lot.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {lot.total_capacity} spots{lot.address ? ` · ${lot.address}` : ""}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="shrink-0" onClick={() => deleteLot(lot.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  {lotLinks.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Link2 className="h-3.5 w-3.5" />
                        Shareable staff links
                      </p>
                      <ul className="space-y-2">
                        {lotLinks.map((link) => (
                          <li
                            key={link.id}
                            className="flex flex-col gap-2 rounded-md bg-muted/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 text-xs">
                              <p className="font-medium text-foreground">{link.name}</p>
                              <p className="text-muted-foreground">
                                …{link.token_prefix} · {link.is_active ? "Active" : "Revoked"}
                              </p>
                            </div>
                            {link.is_active && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                                disabled={saving === `copy-${link.id}`}
                                title="Creates a new URL and copies it. Old link stops working."
                                onClick={() => handleCopyRenewShareLink(link.id)}
                              >
                                <Copy className="mr-1.5 h-3.5 w-3.5" />
                                {saving === `copy-${link.id}` ? "…" : "Copy link"}
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
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
              onChange={(e) => {
                setSelectedLotId(e.target.value);
                loadRatePlan(e.target.value);
                loadShareLinks(e.target.value);
              }}
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
        <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Shareable staff links (mobile)
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Create a link for the selected lot. Staff can open it on a phone to see occupancy and check vehicles in or out without logging in.
        </p>
        <p className="mb-4 text-sm text-muted-foreground">
          Set{" "}
          <code className="rounded bg-muted px-1 text-xs">
            NEXT_PUBLIC_SHAREABLE_LINK_BASE_URL
          </code>{" "}
          (or{" "}
          <code className="rounded bg-muted px-1 text-xs">NEXT_PUBLIC_APP_URL</code>
          ) in production to the exact public origin you want in copied links (e.g. your custom domain). If unset, the browser&apos;s current origin is used when you create or rotate a link.
        </p>
        {lots.length > 0 && selectedLotId ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">These links belong to </span>
              <span className="font-semibold text-foreground">
                {lots.find((l) => l.id === selectedLotId)?.name ?? "—"}
              </span>
              <span className="text-muted-foreground">
                . Change lot with the <span className="font-medium text-foreground">Select Lot</span>{" "}
                control in Rate Plan above.
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium">Link label (optional)</label>
                <Input
                  placeholder="e.g. Front gate tablet"
                  value={newLinkLabel}
                  onChange={(e) => setNewLinkLabel(e.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={handleCreateShareLink}
                disabled={saving === "sharelink"}
              >
                {saving === "sharelink" ? "Creating…" : "Create link"}
              </Button>
            </div>

            {pendingShareUrl && (
              <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    Copy this link and share it with staff. The full URL is not shown again.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingShareUrl(null);
                      setCopyDone(false);
                    }}
                    className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <Input
                    readOnly
                    value={pendingShareUrl}
                    className="font-mono text-xs sm:flex-1"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 sm:w-auto"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(pendingShareUrl);
                        setCopyDone(true);
                        setTimeout(() => setCopyDone(false), 2000);
                      } catch {
                        showError("Could not copy — select the link and copy manually.");
                      }
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {copyDone ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            )}

            {loadingShareLinks ? (
              <p className="text-sm text-muted-foreground">Loading links…</p>
            ) : shareLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No links yet for this lot.</p>
            ) : (
              <ul className="space-y-2">
                {shareLinks.map((link) => (
                  <li
                    key={link.id}
                    className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium">{link.name}</p>
                      <p className="text-xs text-muted-foreground">
                        …{link.token_prefix} · {link.is_active ? "Active" : "Revoked"}
                        {link.expires_at ? ` · Expires ${new Date(link.expires_at).toLocaleDateString()}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(link.created_at).toLocaleString()}
                        {link.last_used_at ? ` · Last used ${new Date(link.last_used_at).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {link.is_active && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={saving === `copy-${link.id}`}
                          title="Creates a new URL and copies it. Old link stops working."
                          onClick={() => handleCopyRenewShareLink(link.id)}
                        >
                          <Copy className="mr-1 h-4 w-4" />
                          {saving === `copy-${link.id}` ? "…" : "Copy link"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={!link.is_active}
                        onClick={() => handleRevokeShareLink(link.id)}
                      >
                        <Ban className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Add a parking lot first.</p>
        )}
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

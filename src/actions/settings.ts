"use server";

import { createClient } from "@/src/lib/supabase/server";
import { generateShareToken } from "@/src/lib/shared-lot/token";
import { getShareableLinkBaseUrl } from "@/src/lib/shareable-link-url";

export interface LotShareLinkSummary {
  id: string;
  parking_lot_id?: string;
  name: string;
  token_prefix: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

export async function updateOrganization(name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return { success: false, error: "Insufficient permissions" };
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const { error } = await supabase
    .from("organizations")
    .update({ name, slug })
    .eq("id", profile.organization_id);

  return error ? { success: false, error: error.message } : { success: true };
}

export async function addParkingLot(input: {
  name: string;
  address: string;
  totalCapacity: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return { success: false, error: "Insufficient permissions" };
  }

  const { data: lot, error } = await supabase
    .from("parking_lots")
    .insert({
      organization_id: profile.organization_id,
      name: input.name,
      address: input.address || null,
      total_capacity: input.totalCapacity,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  // Create default rate plan
  await supabase.from("rate_plans").insert({
    parking_lot_id: lot.id,
    name: "Standard",
    hourly_rate: 50,
    minimum_charge: 20,
    grace_period_minutes: 15,
  });

  return { success: true };
}

export async function updateRatePlan(input: {
  parkingLotId: string;
  hourlyRate: number;
  minimumCharge: number;
  gracePeriodMinutes: number;
  dailyCap: number | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("rate_plans")
    .update({
      hourly_rate: input.hourlyRate,
      minimum_charge: input.minimumCharge,
      grace_period_minutes: input.gracePeriodMinutes,
      daily_cap: input.dailyCap,
    })
    .eq("parking_lot_id", input.parkingLotId)
    .eq("is_active", true);

  return error ? { success: false, error: error.message } : { success: true };
}

export async function listLotShareLinks(parkingLotId: string): Promise<{
  success: boolean;
  links?: LotShareLinkSummary[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return { success: false, error: "Profile not found" };

  const { data: lot } = await supabase
    .from("parking_lots")
    .select("id")
    .eq("id", parkingLotId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (!lot) return { success: false, error: "Lot not found" };

  const { data, error } = await supabase
    .from("lot_shared_links")
    .select("id, parking_lot_id, name, token_prefix, is_active, expires_at, created_at, last_used_at")
    .eq("parking_lot_id", parkingLotId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, links: (data ?? []) as LotShareLinkSummary[] };
}

export async function listAllOrgShareLinks(): Promise<{
  success: boolean;
  links?: LotShareLinkSummary[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return { success: false, error: "Profile not found" };

  const { data, error } = await supabase
    .from("lot_shared_links")
    .select("id, parking_lot_id, name, token_prefix, is_active, expires_at, created_at, last_used_at")
    .eq("organization_id", profile.organization_id)
    .order("parking_lot_id", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, links: (data ?? []) as LotShareLinkSummary[] };
}

export async function createLotShareLink(input: {
  parkingLotId: string;
  name?: string;
  expiresAt?: string | null;
}): Promise<{
  success: boolean;
  linkUrl?: string;
  token?: string;
  linkId?: string;
  error?: string;
  baseUrlMissing?: boolean;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return { success: false, error: "Insufficient permissions" };
  }

  const { data: lot } = await supabase
    .from("parking_lots")
    .select("id")
    .eq("id", input.parkingLotId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (!lot) return { success: false, error: "Lot not found" };

  const { raw, hash, prefix } = generateShareToken();
  const base = getShareableLinkBaseUrl();
  const baseUrlMissing = !base;

  const { data: row, error } = await supabase
    .from("lot_shared_links")
    .insert({
      organization_id: profile.organization_id,
      parking_lot_id: input.parkingLotId,
      name: input.name?.trim() || "Staff link",
      token_hash: hash,
      token_prefix: prefix,
      expires_at: input.expiresAt || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !row) return { success: false, error: error?.message ?? "Failed to create link" };

  const path = `/s/${encodeURIComponent(raw)}`;
  const linkUrl = base ? `${base}${path}` : path;

  return {
    success: true,
    linkUrl,
    token: raw,
    linkId: row.id,
    baseUrlMissing,
  };
}

/**
 * Issue a new secret token for an existing link and return a fresh URL.
 * The previous URL stops working immediately.
 */
export async function rotateLotShareLinkToken(linkId: string): Promise<{
  success: boolean;
  linkUrl?: string;
  token?: string;
  linkId?: string;
  error?: string;
  baseUrlMissing?: boolean;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return { success: false, error: "Insufficient permissions" };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("lot_shared_links")
    .select("id, is_active")
    .eq("id", linkId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (fetchErr || !existing) return { success: false, error: "Link not found" };
  if (!existing.is_active) return { success: false, error: "Link is revoked" };

  const { raw, hash, prefix } = generateShareToken();
  const base = getShareableLinkBaseUrl();
  const baseUrlMissing = !base;

  const { error: updateErr } = await supabase
    .from("lot_shared_links")
    .update({ token_hash: hash, token_prefix: prefix })
    .eq("id", linkId)
    .eq("organization_id", profile.organization_id);

  if (updateErr) return { success: false, error: updateErr.message };

  const path = `/s/${encodeURIComponent(raw)}`;
  const linkUrl = base ? `${base}${path}` : path;

  return {
    success: true,
    linkUrl,
    token: raw,
    linkId: existing.id,
    baseUrlMissing,
  };
}

export async function revokeLotShareLink(linkId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return { success: false, error: "Insufficient permissions" };
  }

  const { error } = await supabase
    .from("lot_shared_links")
    .update({ is_active: false })
    .eq("id", linkId)
    .eq("organization_id", profile.organization_id);

  return error ? { success: false, error: error.message } : { success: true };
}

"use server";

import { createClient } from "@/src/lib/supabase/server";
import { normalizePlate } from "@/src/lib/plate";
import { calculateBill } from "@/src/lib/billing";

export interface CheckInInput {
  parkingLotId: string;
  confirmedPlate: string;
  rawDetectedPlate: string | null;
  wasManuallyEdited: boolean;
  confidence: number | null;
  imageStoragePath: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface CheckInResult {
  success: boolean;
  visitId?: string;
  error?: string;
}

export async function checkInVehicle(input: CheckInInput): Promise<CheckInResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return { success: false, error: "Profile not found" };

  const normalized = normalizePlate(input.confirmedPlate);

  // Check for existing active visit at this lot only (same plate may be at another lot)
  const { data: existing } = await supabase
    .from("visits")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .eq("parking_lot_id", input.parkingLotId)
    .eq("normalized_plate", normalized)
    .eq("status", "checked_in")
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      error: `Vehicle ${normalized} is already checked in at this parking lot`,
    };
  }

  // Upsert vehicle record
  const { data: vehicle } = await supabase
    .from("vehicles")
    .upsert(
      {
        organization_id: profile.organization_id,
        normalized_plate: normalized,
        raw_plates: input.rawDetectedPlate ? [input.rawDetectedPlate] : [],
      },
      { onConflict: "organization_id,normalized_plate" },
    )
    .select("id")
    .single();

  // Get rate plan snapshot
  const { data: ratePlan } = await supabase
    .from("rate_plans")
    .select("hourly_rate, minimum_charge")
    .eq("parking_lot_id", input.parkingLotId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  // Create visit
  const { data: visit, error: visitErr } = await supabase
    .from("visits")
    .insert({
      organization_id: profile.organization_id,
      parking_lot_id: input.parkingLotId,
      vehicle_id: vehicle?.id ?? null,
      normalized_plate: normalized,
      status: "checked_in",
      check_in_at: new Date().toISOString(),
      hourly_rate_snapshot: ratePlan?.hourly_rate ?? 50,
      minimum_charge_snapshot: ratePlan?.minimum_charge ?? 20,
      checked_in_by: user.id,
    })
    .select("id")
    .single();

  if (visitErr) {
    return { success: false, error: visitErr.message };
  }

  // Create plate review record
  await supabase.from("plate_reviews").insert({
    visit_id: visit.id,
    raw_detected_plate: input.rawDetectedPlate,
    confirmed_plate: normalized,
    confirmed_by: user.id,
    was_manually_edited: input.wasManuallyEdited,
    confidence: input.confidence,
  });

  // Increment vehicle visit count
  if (vehicle?.id) {
    try {
      await supabase
        .from("vehicles")
        .update({ visit_count: (await supabase.from("vehicles").select("visit_count").eq("id", vehicle.id).single()).data?.visit_count + 1 || 1 })
        .eq("id", vehicle.id);
    } catch { /* best effort */ }
  }

  return { success: true, visitId: visit.id };
}

export interface CheckOutInput {
  confirmedPlate: string;
  rawDetectedPlate: string | null;
  wasManuallyEdited: boolean;
  confidence: number | null;
}

export interface CheckOutLookupResult {
  success: boolean;
  visit?: {
    id: string;
    normalized_plate: string;
    check_in_at: string;
    parking_lot_id: string;
    parking_lot_name: string;
    hourly_rate: number;
    minimum_charge: number;
    grace_period_minutes: number;
    daily_cap: number | null;
    duration_minutes: number;
    billable_hours: number;
    final_amount: number;
    breakdown: string;
  };
  error?: string;
}

export async function lookupActiveVisit(confirmedPlate: string): Promise<CheckOutLookupResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const normalized = normalizePlate(confirmedPlate);

  const { data: activeVisit, error: fetchErr } = await supabase
    .from("visits")
    .select("*, parking_lots(name)")
    .eq("normalized_plate", normalized)
    .eq("status", "checked_in")
    .order("check_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) return { success: false, error: fetchErr.message };
  if (!activeVisit) return { success: false, error: `No active visit found for plate ${normalized}` };

  const { data: ratePlan } = await supabase
    .from("rate_plans")
    .select("*")
    .eq("parking_lot_id", activeVisit.parking_lot_id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const now = new Date();
  const hourlyRate = ratePlan?.hourly_rate ?? activeVisit.hourly_rate_snapshot ?? 50;
  const minimumCharge = ratePlan?.minimum_charge ?? activeVisit.minimum_charge_snapshot ?? 20;
  const gracePeriod = ratePlan?.grace_period_minutes ?? 15;
  const dailyCap = ratePlan?.daily_cap ?? null;

  const billing = calculateBill({
    checkInAt: new Date(activeVisit.check_in_at),
    checkOutAt: now,
    hourlyRate,
    minimumCharge,
    gracePeriodMinutes: gracePeriod,
    dailyCap,
  });

  const lotName = (activeVisit as Record<string, unknown>).parking_lots;

  return {
    success: true,
    visit: {
      id: activeVisit.id,
      normalized_plate: activeVisit.normalized_plate,
      check_in_at: activeVisit.check_in_at,
      parking_lot_id: activeVisit.parking_lot_id,
      parking_lot_name: (lotName as { name: string } | null)?.name ?? "Unknown",
      hourly_rate: hourlyRate,
      minimum_charge: minimumCharge,
      grace_period_minutes: gracePeriod,
      daily_cap: dailyCap,
      duration_minutes: billing.durationMinutes,
      billable_hours: billing.billableHours,
      final_amount: billing.finalAmount,
      breakdown: billing.breakdown,
    },
  };
}

export interface ConfirmCheckOutResult {
  success: boolean;
  invoiceId?: string;
  receiptNumber?: string;
  error?: string;
}

export async function confirmCheckOut(
  visitId: string,
  input: CheckOutInput,
): Promise<ConfirmCheckOutResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return { success: false, error: "Profile not found" };

  // Re-fetch visit to get latest state
  const { data: visit } = await supabase
    .from("visits")
    .select("*, parking_lots(name)")
    .eq("id", visitId)
    .eq("status", "checked_in")
    .single();

  if (!visit) return { success: false, error: "Visit not found or already checked out" };

  const { data: ratePlan } = await supabase
    .from("rate_plans")
    .select("*")
    .eq("parking_lot_id", visit.parking_lot_id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const now = new Date();
  const hourlyRate = ratePlan?.hourly_rate ?? visit.hourly_rate_snapshot ?? 50;
  const minimumCharge = ratePlan?.minimum_charge ?? visit.minimum_charge_snapshot ?? 20;

  const billing = calculateBill({
    checkInAt: new Date(visit.check_in_at),
    checkOutAt: now,
    hourlyRate,
    minimumCharge,
    gracePeriodMinutes: ratePlan?.grace_period_minutes ?? 15,
    dailyCap: ratePlan?.daily_cap ?? null,
  });

  // Update visit
  const { error: updateErr } = await supabase
    .from("visits")
    .update({
      status: "checked_out",
      check_out_at: now.toISOString(),
      duration_minutes: billing.durationMinutes,
      amount_charged: billing.finalAmount,
      checked_out_by: user.id,
    })
    .eq("id", visitId);

  if (updateErr) return { success: false, error: updateErr.message };

  const lotName = (visit as Record<string, unknown>).parking_lots;

  // Generate receipt number
  const receiptNumber = `PKE-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString(36).toUpperCase()}`;

  // Create invoice
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      visit_id: visitId,
      organization_id: profile.organization_id,
      receipt_number: receiptNumber,
      amount: billing.finalAmount,
      duration_minutes: billing.durationMinutes,
      hourly_rate: hourlyRate,
      minimum_charge: minimumCharge,
      vehicle_plate: visit.normalized_plate,
      parking_lot_name: (lotName as { name: string } | null)?.name ?? "Unknown",
      check_in_at: visit.check_in_at,
      check_out_at: now.toISOString(),
      paid: true,
    })
    .select("id")
    .single();

  if (invErr) return { success: false, error: invErr.message };

  // Create plate review record
  await supabase.from("plate_reviews").insert({
    visit_id: visitId,
    raw_detected_plate: input.rawDetectedPlate,
    confirmed_plate: normalizePlate(input.confirmedPlate),
    confirmed_by: user.id,
    was_manually_edited: input.wasManuallyEdited,
    confidence: input.confidence,
  });

  return { success: true, invoiceId: invoice.id, receiptNumber };
}

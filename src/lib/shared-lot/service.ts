import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/src/lib/supabase/server";
import { normalizePlate } from "@/src/lib/plate";
import { calculateBill } from "@/src/lib/billing";
import { hashShareToken } from "./token";

export interface LotSharedLinkRow {
  id: string;
  organization_id: string;
  parking_lot_id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParkingLotBrief {
  id: string;
  name: string;
  address: string | null;
  total_capacity: number;
  is_active: boolean;
}

export interface LotStats {
  totalSpaces: number;
  activeVehicles: number;
  remainingSpaces: number;
  todayCollection: number;
  monthCollection: number;
}

export interface ResolvedShareContext {
  link: LotSharedLinkRow;
  lot: ParkingLotBrief;
}

export type PublicCheckInResult =
  | { success: true; visitId: string }
  | { success: false; code: "ALREADY_HERE"; error: string }
  | {
      success: false;
      code: "CHECKED_IN_ELSEWHERE";
      error: string;
      conflictingVisitId: string;
      otherParkingLotId: string;
      otherParkingLotName: string;
    }
  | { success: false; code: "CHECK_IN_FAILED"; error: string };

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

export async function getServiceSupabase(): Promise<SupabaseClient> {
  return createServiceClient();
}

export async function resolveShareToken(rawToken: string): Promise<ResolvedShareContext | null> {
  const supabase = await getServiceSupabase();
  const hash = hashShareToken(rawToken);
  const { data: link, error } = await supabase
    .from("lot_shared_links")
    .select("*")
    .eq("token_hash", hash)
    .maybeSingle();

  if (error || !link) return null;

  const row = link as LotSharedLinkRow;
  if (!row.is_active) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  const { data: lot, error: lotErr } = await supabase
    .from("parking_lots")
    .select("id, name, address, total_capacity, is_active")
    .eq("id", row.parking_lot_id)
    .eq("organization_id", row.organization_id)
    .maybeSingle();

  if (lotErr || !lot || !lot.is_active) return null;

  return {
    link: row,
    lot: lot as ParkingLotBrief,
  };
}

export async function touchLinkLastUsed(linkId: string): Promise<void> {
  const supabase = await getServiceSupabase();
  await supabase
    .from("lot_shared_links")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", linkId);
}

export async function fetchLotStats(
  supabase: SupabaseClient,
  parkingLotId: string,
  totalCapacity: number,
): Promise<LotStats> {
  const { count: activeVehicles } = await supabase
    .from("visits")
    .select("id", { count: "exact", head: true })
    .eq("parking_lot_id", parkingLotId)
    .eq("status", "checked_in");

  const active = activeVehicles ?? 0;
  const now = new Date();
  const dayStart = startOfUtcDay(now).toISOString();
  const monthStart = startOfUtcMonth(now).toISOString();

  const { data: todayRows } = await supabase
    .from("visits")
    .select("amount_charged")
    .eq("parking_lot_id", parkingLotId)
    .eq("status", "checked_out")
    .gte("check_out_at", dayStart);

  const { data: monthRows } = await supabase
    .from("visits")
    .select("amount_charged")
    .eq("parking_lot_id", parkingLotId)
    .eq("status", "checked_out")
    .gte("check_out_at", monthStart);

  const todayCollection =
    todayRows?.reduce((s, v) => s + Number(v.amount_charged ?? 0), 0) ?? 0;
  const monthCollection =
    monthRows?.reduce((s, v) => s + Number(v.amount_charged ?? 0), 0) ?? 0;

  return {
    totalSpaces: totalCapacity,
    activeVehicles: active,
    remainingSpaces: Math.max(0, totalCapacity - active),
    todayCollection,
    monthCollection,
  };
}

export async function publicCheckIn(input: {
  organizationId: string;
  parkingLotId: string;
  plate: string;
  rawDetectedPlate: string | null;
  confidence: number | null;
  wasManuallyEdited: boolean;
}): Promise<PublicCheckInResult> {
  const supabase = await getServiceSupabase();
  const normalized = normalizePlate(input.plate);

  const { data: existing } = await supabase
    .from("visits")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("parking_lot_id", input.parkingLotId)
    .eq("normalized_plate", normalized)
    .eq("status", "checked_in")
    .maybeSingle();

  if (existing) {
    return {
      success: false as const,
      code: "ALREADY_HERE" as const,
      error: `Vehicle ${normalized} is already checked in at this parking lot`,
    };
  }

  const { data: conflictRows } = await supabase
    .from("visits")
    .select("id, parking_lot_id, parking_lots(name)")
    .eq("organization_id", input.organizationId)
    .eq("normalized_plate", normalized)
    .eq("status", "checked_in")
    .neq("parking_lot_id", input.parkingLotId)
    .order("check_in_at", { ascending: false })
    .limit(1);

  const conflict = conflictRows?.[0] as
    | { id: string; parking_lot_id: string; parking_lots: { name: string } | null }
    | undefined;

  if (conflict) {
    const otherName =
      conflict.parking_lots && typeof conflict.parking_lots === "object" && "name" in conflict.parking_lots
        ? String((conflict.parking_lots as { name: string }).name)
        : "another parking lot";
    return {
      success: false as const,
      code: "CHECKED_IN_ELSEWHERE" as const,
      error: `This vehicle is already checked in at ${otherName}. Check-in here is blocked until that session ends or management resolves it.`,
      conflictingVisitId: conflict.id,
      otherParkingLotId: conflict.parking_lot_id,
      otherParkingLotName: otherName,
    };
  }

  const { data: vehicle } = await supabase
    .from("vehicles")
    .upsert(
      {
        organization_id: input.organizationId,
        normalized_plate: normalized,
        raw_plates: input.rawDetectedPlate ? [input.rawDetectedPlate] : [],
      },
      { onConflict: "organization_id,normalized_plate" },
    )
    .select("id")
    .single();

  const { data: ratePlan } = await supabase
    .from("rate_plans")
    .select("hourly_rate, minimum_charge")
    .eq("parking_lot_id", input.parkingLotId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data: visit, error: visitErr } = await supabase
    .from("visits")
    .insert({
      organization_id: input.organizationId,
      parking_lot_id: input.parkingLotId,
      vehicle_id: vehicle?.id ?? null,
      normalized_plate: normalized,
      status: "checked_in",
      check_in_at: new Date().toISOString(),
      hourly_rate_snapshot: ratePlan?.hourly_rate ?? 50,
      minimum_charge_snapshot: ratePlan?.minimum_charge ?? 20,
      checked_in_by: null,
    })
    .select("id")
    .single();

  if (visitErr || !visit) {
    return {
      success: false as const,
      code: "CHECK_IN_FAILED" as const,
      error: visitErr?.message ?? "Check-in failed",
    };
  }

  await supabase.from("plate_reviews").insert({
    visit_id: visit.id,
    raw_detected_plate: input.rawDetectedPlate,
    confirmed_plate: normalized,
    confirmed_by: null,
    was_manually_edited: input.wasManuallyEdited,
    confidence: input.confidence,
  });

  if (vehicle?.id) {
    try {
      const { data: v } = await supabase
        .from("vehicles")
        .select("visit_count")
        .eq("id", vehicle.id)
        .single();
      await supabase
        .from("vehicles")
        .update({ visit_count: (v?.visit_count ?? 0) + 1 })
        .eq("id", vehicle.id);
    } catch {
      /* best effort */
    }
  }

  return { success: true as const, visitId: visit.id };
}

export async function publicSubmitCheckInDispute(input: {
  organizationId: string;
  intendedParkingLotId: string;
  conflictingVisitId: string;
  normalizedPlate: string;
  employeeNote: string | null;
  lotSharedLinkId: string | null;
}): Promise<{ success: boolean; disputeId?: string; error?: string }> {
  const supabase = await getServiceSupabase();
  const normalized = normalizePlate(input.normalizedPlate);

  const { data: visit, error: vErr } = await supabase
    .from("visits")
    .select("id, organization_id, parking_lot_id, normalized_plate, status")
    .eq("id", input.conflictingVisitId)
    .maybeSingle();

  if (vErr || !visit) return { success: false, error: "Visit not found" };
  if (visit.organization_id !== input.organizationId) return { success: false, error: "Invalid dispute" };
  if (visit.status !== "checked_in") {
    return { success: false, error: "That vehicle is no longer checked in at the other lot" };
  }
  if (normalizePlate(visit.normalized_plate) !== normalized) {
    return { success: false, error: "Plate does not match this visit" };
  }
  if (visit.parking_lot_id === input.intendedParkingLotId) {
    return { success: false, error: "Invalid dispute" };
  }

  const { data: row, error } = await supabase
    .from("check_in_disputes")
    .insert({
      organization_id: input.organizationId,
      intended_parking_lot_id: input.intendedParkingLotId,
      conflicting_visit_id: input.conflictingVisitId,
      normalized_plate: normalized,
      employee_note: input.employeeNote?.trim() || null,
      lot_shared_link_id: input.lotSharedLinkId,
    })
    .select("id")
    .single();

  if (error || !row) return { success: false, error: error?.message ?? "Could not submit dispute" };
  return { success: true, disputeId: row.id };
}

export async function publicCheckoutPreview(input: {
  organizationId: string;
  parkingLotId: string;
  plate: string;
}) {
  const supabase = await getServiceSupabase();
  const normalized = normalizePlate(input.plate);

  const { data: activeVisit, error: fetchErr } = await supabase
    .from("visits")
    .select("*, parking_lots(name)")
    .eq("organization_id", input.organizationId)
    .eq("parking_lot_id", input.parkingLotId)
    .eq("normalized_plate", normalized)
    .eq("status", "checked_in")
    .order("check_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) return { success: false as const, error: fetchErr.message };
  if (!activeVisit) {
    return { success: false as const, error: `No active visit for ${normalized} at this lot` };
  }

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
    hourlyRate: Number(hourlyRate),
    minimumCharge: Number(minimumCharge),
    gracePeriodMinutes: gracePeriod,
    dailyCap: dailyCap != null ? Number(dailyCap) : null,
  });

  const lotName = (activeVisit as Record<string, unknown>).parking_lots as { name: string } | null;

  return {
    success: true as const,
    visit: {
      id: activeVisit.id,
      normalized_plate: activeVisit.normalized_plate,
      check_in_at: activeVisit.check_in_at,
      parking_lot_id: activeVisit.parking_lot_id,
      parking_lot_name: lotName?.name ?? "Unknown",
      hourly_rate: Number(hourlyRate),
      minimum_charge: Number(minimumCharge),
      grace_period_minutes: gracePeriod,
      daily_cap: dailyCap != null ? Number(dailyCap) : null,
      duration_minutes: billing.durationMinutes,
      billable_hours: billing.billableHours,
      final_amount: billing.finalAmount,
      breakdown: billing.breakdown,
    },
  };
}

export async function publicCheckoutConfirm(input: {
  organizationId: string;
  parkingLotId: string;
  visitId: string;
  plate: string;
  rawDetectedPlate: string | null;
  confidence: number | null;
  wasManuallyEdited: boolean;
}) {
  const supabase = await getServiceSupabase();
  const normalized = normalizePlate(input.plate);

  const { data: visit, error: visitErr } = await supabase
    .from("visits")
    .select("*, parking_lots(name)")
    .eq("id", input.visitId)
    .eq("organization_id", input.organizationId)
    .eq("parking_lot_id", input.parkingLotId)
    .eq("normalized_plate", normalized)
    .eq("status", "checked_in")
    .single();

  if (visitErr || !visit) {
    return { success: false as const, error: "Visit not found or already checked out" };
  }

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
    hourlyRate: Number(hourlyRate),
    minimumCharge: Number(minimumCharge),
    gracePeriodMinutes: ratePlan?.grace_period_minutes ?? 15,
    dailyCap: ratePlan?.daily_cap != null ? Number(ratePlan.daily_cap) : null,
  });

  const { error: updateErr } = await supabase
    .from("visits")
    .update({
      status: "checked_out",
      check_out_at: now.toISOString(),
      duration_minutes: billing.durationMinutes,
      amount_charged: billing.finalAmount,
      checked_out_by: null,
    })
    .eq("id", input.visitId);

  if (updateErr) return { success: false as const, error: updateErr.message };

  const lotName = (visit as Record<string, unknown>).parking_lots as { name: string } | null;
  const receiptNumber = `PKE-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString(36).toUpperCase()}`;

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      visit_id: input.visitId,
      organization_id: input.organizationId,
      receipt_number: receiptNumber,
      amount: billing.finalAmount,
      duration_minutes: billing.durationMinutes,
      hourly_rate: Number(hourlyRate),
      minimum_charge: Number(minimumCharge),
      vehicle_plate: visit.normalized_plate,
      parking_lot_name: lotName?.name ?? "Unknown",
      check_in_at: visit.check_in_at,
      check_out_at: now.toISOString(),
      paid: true,
    })
    .select("id")
    .single();

  if (invErr || !invoice) {
    return { success: false as const, error: invErr?.message ?? "Invoice failed" };
  }

  await supabase.from("plate_reviews").insert({
    visit_id: input.visitId,
    raw_detected_plate: input.rawDetectedPlate,
    confirmed_plate: normalized,
    confirmed_by: null,
    was_manually_edited: input.wasManuallyEdited,
    confidence: input.confidence,
  });

  return { success: true as const, invoiceId: invoice.id, receiptNumber };
}

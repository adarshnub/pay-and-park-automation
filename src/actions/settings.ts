"use server";

import { createClient } from "@/src/lib/supabase/server";

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

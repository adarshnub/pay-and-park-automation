"use server";

import { createClient } from "@/src/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateCheckInDisputeStatus(
  disputeId: string,
  status: "resolved" | "dismissed",
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const { data: existing, error: fetchErr } = await supabase
    .from("check_in_disputes")
    .select("id, status")
    .eq("id", disputeId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { success: false, error: "Dispute not found" };
  }
  if (existing.status !== "open") {
    return { success: false, error: "This dispute is already closed" };
  }

  const { error } = await supabase
    .from("check_in_disputes")
    .update({ status })
    .eq("id", disputeId)
    .eq("status", "open");

  if (error) return { success: false, error: error.message };
  revalidatePath("/disputes");
  return { success: true };
}

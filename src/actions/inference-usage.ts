"use server";

import { createClient } from "@/src/lib/supabase/server";

export interface OcrInferenceLogRow {
  id: string;
  created_at: string;
  source: string;
  provider: string;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
}

export interface OcrInferenceModelRollup {
  provider: string;
  model: string;
  events: number;
  sumPrompt: number;
  sumCompletion: number;
  sumTotal: number;
}

export async function listOcrInferenceUsage(): Promise<
  | {
      success: true;
      recent: OcrInferenceLogRow[];
      rollup: OcrInferenceModelRollup[];
      tableMissing: boolean;
    }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

  const { data: rows, error } = await supabase
    .from("ocr_inference_logs")
    .select(
      "id, created_at, source, provider, model, prompt_tokens, completion_tokens, total_tokens",
    )
    .gte("created_at", thirtyDaysAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    const msg = `${error.message ?? ""} ${(error as { details?: string }).details ?? ""}`.toLowerCase();
    if (
      error.code === "42P01" ||
      msg.includes("ocr_inference_logs") ||
      msg.includes("schema cache") ||
      msg.includes("does not exist")
    ) {
      return {
        success: true,
        recent: [],
        rollup: [],
        tableMissing: true,
      };
    }
    return { success: false, error: error.message };
  }

  const list = (rows ?? []) as OcrInferenceLogRow[];
  const recent = list.slice(0, 50);
  const rollupMap = new Map<string, OcrInferenceModelRollup>();

  for (const r of list) {
    const key = `${r.provider}:${r.model ?? "unknown"}`;
    const cur = rollupMap.get(key) ?? {
      provider: r.provider,
      model: r.model ?? "unknown",
      events: 0,
      sumPrompt: 0,
      sumCompletion: 0,
      sumTotal: 0,
    };
    cur.events += 1;
    cur.sumPrompt += r.prompt_tokens ?? 0;
    cur.sumCompletion += r.completion_tokens ?? 0;
    const rowTotal =
      r.total_tokens ??
      (r.prompt_tokens != null || r.completion_tokens != null
        ? (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0)
        : 0);
    cur.sumTotal += rowTotal;
    rollupMap.set(key, cur);
  }

  const rollup = [...rollupMap.values()].sort((a, b) => b.sumTotal - a.sumTotal);

  return { success: true, recent, rollup, tableMissing: false };
}

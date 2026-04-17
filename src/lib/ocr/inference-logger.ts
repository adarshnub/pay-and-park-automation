import { createServiceClient } from "@/src/lib/supabase/server";
import type { OcrTokenUsage } from "@/src/lib/ocr/pipeline";

export async function logOcrInferenceUsage(input: {
  organizationId: string;
  parkingLotId: string | null;
  source: "dashboard" | "shared_lot";
  tokenUsage: OcrTokenUsage;
}): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const { error } = await supabase.from("ocr_inference_logs").insert({
      organization_id: input.organizationId,
      parking_lot_id: input.parkingLotId,
      source: input.source,
      provider: input.tokenUsage.provider,
      model: input.tokenUsage.model,
      prompt_tokens: input.tokenUsage.promptTokens,
      completion_tokens: input.tokenUsage.completionTokens,
      total_tokens: input.tokenUsage.totalTokens,
    });
    if (error) {
      console.error("[ocr_inference_logs] insert failed:", error.message);
    }
  } catch (e) {
    console.error("[ocr_inference_logs]", e instanceof Error ? e.message : e);
  }
}

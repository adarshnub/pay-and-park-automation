import { createServiceClient } from "@/src/lib/supabase/server";
import { normalizeOcrDetectionMode, type OcrDetectionMode } from "@/src/lib/ocr/detection-mode";

/** For routes without a user session (e.g. shared-lot token). Service role read. */
export async function fetchOrgOcrDetectionMode(organizationId: string): Promise<OcrDetectionMode> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("ocr_detection_mode")
    .eq("id", organizationId)
    .maybeSingle();

  if (error || !data) return "openai";
  return normalizeOcrDetectionMode(
    (data as { ocr_detection_mode?: string | null }).ocr_detection_mode,
  );
}

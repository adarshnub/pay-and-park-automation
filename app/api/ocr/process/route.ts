import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/lib/supabase/server";
import { logOcrInferenceUsage } from "@/src/lib/ocr/inference-logger";
import { normalizeOcrDetectionMode } from "@/src/lib/ocr/detection-mode";
import { runServerOcrPipeline } from "@/src/lib/ocr/server-ocr-pipeline";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let imageFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      imageFile = formData.get("image") as File | null;
    }

    if (!imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let organizationId: string | null = null;
    let detectionMode = normalizeOcrDetectionMode(undefined);
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();
      organizationId = profile?.organization_id ?? null;
      if (organizationId) {
        const { data: orgRow, error: orgModeErr } = await supabase
          .from("organizations")
          .select("ocr_detection_mode")
          .eq("id", organizationId)
          .maybeSingle();
        if (!orgModeErr && orgRow) {
          detectionMode = normalizeOcrDetectionMode(
            (orgRow as { ocr_detection_mode?: string | null }).ocr_detection_mode,
          );
        }
      }
    }

    const imageBytes = Buffer.from(await imageFile.arrayBuffer());
    const mimeType = imageFile.type || "image/jpeg";

    const result = await runServerOcrPipeline({
      imageBytes,
      mimeType,
      logLabel: "api/ocr/process",
      detectionMode,
      onInferenceUsage:
        organizationId != null
          ? (tokenUsage) =>
              logOcrInferenceUsage({
                organizationId,
                parkingLotId: null,
                source: "dashboard",
                tokenUsage,
              })
          : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OCR processing failed" },
      { status: 500 },
    );
  }
}

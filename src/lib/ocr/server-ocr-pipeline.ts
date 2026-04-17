import {
  processWithGemini,
  processWithOpenAI,
  processWithTesseract,
  type OcrRunResult,
  type OcrTokenUsage,
} from "@/src/lib/ocr/pipeline";
import {
  getEdgeOcrConfig,
  processWithTesseractViaEdge,
} from "@/src/lib/ocr/edge-tesseract";
import type { OcrDetectionMode } from "@/src/lib/ocr/detection-mode";
import { getGeminiOcrModel, getOpenAiOcrModel } from "@/src/lib/ocr/ocr-models";

function allowServerTesseractOnVercel(): boolean {
  return process.env.SHARED_LOT_ALLOW_SERVER_TESSERACT === "true";
}

function modeBlockedResult(message: string): OcrRunResult {
  return {
    plate: "",
    confidence: 0,
    engine: "free",
    croppedPlateUrl: null,
    message,
  };
}

/**
 * Shared server OCR for dashboard + shared-link flows.
 * `detectionMode` comes from `organizations.ocr_detection_mode` (`openai` | `gemini` | `tesseract`).
 */
export async function runServerOcrPipeline(input: {
  imageBytes: Buffer;
  mimeType: string;
  logLabel: string;
  onInferenceUsage?: (usage: OcrTokenUsage) => void | Promise<void>;
  detectionMode?: OcrDetectionMode;
}): Promise<OcrRunResult> {
  const { imageBytes, mimeType, logLabel, onInferenceUsage, detectionMode = "openai" } = input;

  let latestPaidUsage: OcrTokenUsage | undefined;

  async function emitInferenceUsage(
    cb: ((usage: OcrTokenUsage) => void | Promise<void>) | undefined,
    usage: OcrTokenUsage | null | undefined,
  ): Promise<void> {
    if (usage) latestPaidUsage = usage;
    if (!cb || !usage) return;
    try {
      await cb(usage);
    } catch (e) {
      console.error("[runServerOcrPipeline] onInferenceUsage failed:", e);
    }
  }

  function withCarriedPaidUsage(r: OcrRunResult): OcrRunResult {
    if (r.tokenUsage || !latestPaidUsage) return r;
    return { ...r, tokenUsage: latestPaidUsage };
  }

  const onVercel = Boolean(process.env.VERCEL);
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const geminiModel = getGeminiOcrModel();
  const openaiKey = process.env.OPENAI_API_KEY?.trim() || "";
  const openaiModel = getOpenAiOcrModel();
  const edgeCfg = getEdgeOcrConfig();

  switch (detectionMode) {
    case "gemini": {
      if (!geminiKey) {
        return modeBlockedResult(
          "Organization uses Gemini only, but GEMINI_API_KEY is not configured on the server.",
        );
      }
      if (!geminiKey.startsWith("AIza")) {
        return modeBlockedResult(
          "GEMINI_API_KEY must be a Google AI Studio key (starts with AIza…).",
        );
      }
      try {
        const result = await processWithGemini(
          imageBytes,
          mimeType,
          geminiKey,
          geminiModel,
        );
        await emitInferenceUsage(onInferenceUsage, result.tokenUsage ?? undefined);
        return withCarriedPaidUsage(result);
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.error(`[${logLabel}] Gemini-only mode failed:`, err);
        }
        return modeBlockedResult(
          `Gemini OCR failed: ${err instanceof Error ? err.message : "Unknown error"}. Enter the plate manually or switch mode.`,
        );
      }
    }
    case "openai": {
      if (!openaiKey) {
        return modeBlockedResult(
          "Organization uses OpenAI only, but OPENAI_API_KEY is not configured on the server.",
        );
      }
      try {
        const result = await processWithOpenAI(
          imageBytes,
          mimeType,
          openaiKey,
          openaiModel,
          { imageDetail: "low" },
        );
        await emitInferenceUsage(onInferenceUsage, result.tokenUsage ?? undefined);
        return withCarriedPaidUsage(result);
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.error(`[${logLabel}] OpenAI-only mode failed:`, err);
        }
        return modeBlockedResult(
          `OpenAI OCR failed: ${err instanceof Error ? err.message : "Unknown error"}. Enter the plate manually or switch mode.`,
        );
      }
    }
    case "tesseract": {
      if (edgeCfg) {
        try {
          return withCarriedPaidUsage(
            await processWithTesseractViaEdge(imageBytes, edgeCfg.url, edgeCfg.secret),
          );
        } catch (err) {
          if (process.env.NODE_ENV === "development") {
            console.error(`[${logLabel}] Edge Tesseract failed, trying Node:`, err);
          }
        }
      }
      if (onVercel && !allowServerTesseractOnVercel()) {
        return modeBlockedResult(
          "Tesseract mode: Edge OCR is not configured or failed, and Node Tesseract is disabled on Vercel. Set SUPABASE_OCR_EDGE_URL + OCR_EDGE_SECRET, or enable SHARED_LOT_ALLOW_SERVER_TESSERACT, or switch to OpenAI/Gemini.",
        );
      }
      try {
        return withCarriedPaidUsage(await processWithTesseract(imageBytes));
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.error(`[${logLabel}] Tesseract (Node) failed:`, err);
        }
        return modeBlockedResult(
          `Tesseract failed: ${err instanceof Error ? err.message : "Unknown error"}.`,
        );
      }
    }
  }
}

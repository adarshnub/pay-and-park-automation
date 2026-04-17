"use server";

import { createClient } from "@/src/lib/supabase/server";
import { getGeminiOcrModel, getOpenAiOcrModel } from "@/src/lib/ocr/ocr-models";

export type OcrUsageStepStatus = "on" | "off" | "warning";

export interface OcrUsageStep {
  order: number;
  title: string;
  status: OcrUsageStepStatus;
  /** Non-secret detail, e.g. model id */
  detail?: string;
  hint?: string;
}

export interface OcrUsageSummary {
  /** Next.js deployment (Vercel sets VERCEL) */
  deployment: "vercel" | "other";
  /** Try order for dashboard + shared-link image OCR */
  inlineSteps: OcrUsageStep[];
  /** Same env file often feeds the worker */
  workerNotes: string[];
  geminiKeyLooksInvalid: boolean;
}

export async function getOcrUsageSummary(): Promise<
  { success: true; summary: OcrUsageSummary } | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const vercel = Boolean(process.env.VERCEL);
  const easyOn = Boolean(
    process.env.OCR_SERVICE_URL?.trim() && process.env.OCR_SERVICE_SECRET?.trim(),
  );
  const geminiKey = process.env.GEMINI_API_KEY?.trim() || "";
  const geminiOn = Boolean(geminiKey);
  const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const geminiKeyLooksInvalid = geminiOn && !geminiKey.startsWith("AIza");
  const openaiOn = Boolean(process.env.OPENAI_API_KEY?.trim());
  const edgeOn = Boolean(
    process.env.SUPABASE_OCR_EDGE_URL?.trim() && process.env.OCR_EDGE_SECRET?.trim(),
  );
  const allowNodeTesseractOnVercel =
    process.env.SHARED_LOT_ALLOW_SERVER_TESSERACT === "true";
  const nodeTesseractConfigured = !vercel || allowNodeTesseractOnVercel;

  const inlineSteps: OcrUsageStep[] = [
    {
      order: 1,
      title: "EasyOCR (HTTP service)",
      status: easyOn ? "on" : "off",
      detail: easyOn ? "Tried first when configured" : undefined,
      hint: easyOn
        ? "English reader + plate heuristics (see services/anpr-worker/http_api.py)"
        : "Set OCR_SERVICE_URL and OCR_SERVICE_SECRET (e.g. container running http_api.py).",
    },
    {
      order: 2,
      title: "Google Gemini",
      status: geminiKeyLooksInvalid ? "warning" : geminiOn ? "on" : "off",
      detail: geminiOn ? `Model: ${geminiModel}` : undefined,
      hint: geminiKeyLooksInvalid
        ? "GEMINI_API_KEY should be an AI Studio key starting with AIza…"
        : geminiOn
          ? "Generative Language API; retries on 429 / 5xx"
          : "Set GEMINI_API_KEY (optional). Optional GEMINI_MODEL overrides default.",
    },
    {
      order: 3,
      title: "OpenAI",
      status: openaiOn ? "on" : "off",
      detail: openaiOn
        ? `Model: ${getOpenAiOcrModel()} (vision, low image detail on OCR routes)`
        : undefined,
      hint: openaiOn ? undefined : "Set OPENAI_API_KEY for vision fallback.",
    },
    {
      order: 4,
      title: "Supabase Edge + Tesseract.js",
      status: edgeOn ? "on" : "off",
      detail: edgeOn ? "Optional; Deno may not run Tesseract workers" : undefined,
      hint: edgeOn
        ? "SUPABASE_OCR_EDGE_URL + OCR_EDGE_SECRET"
        : "Set SUPABASE_OCR_EDGE_URL + OCR_EDGE_SECRET to enable.",
    },
    {
      order: 5,
      title: "Tesseract.js (Node)",
      status: nodeTesseractConfigured ? "on" : "off",
      detail: vercel
        ? allowNodeTesseractOnVercel
          ? "Enabled on Vercel (SHARED_LOT_ALLOW_SERVER_TESSERACT=true)"
          : "Skipped on Vercel unless SHARED_LOT_ALLOW_SERVER_TESSERACT=true"
        : "Used last on typical self-hosted / local runs",
      hint: vercel && !allowNodeTesseractOnVercel
        ? "Heavy; prefer EasyOCR service or cloud vision on serverless."
        : undefined,
    },
  ];

  const workerNotes = [
    "The Python ANPR worker (services/anpr-worker/worker.py) polls ocr_jobs: EasyOCR Reader([\"en\"], gpu=False) first.",
    openaiOn
      ? `Worker may call OpenAI ${getOpenAiOcrModel()} when EasyOCR confidence is below OCR_CONFIDENCE_THRESHOLD (same OPENAI_API_KEY).`
      : "Worker OpenAI fallback is off until OPENAI_API_KEY is set.",
  ];

  return {
    success: true,
    summary: {
      deployment: vercel ? "vercel" : "other",
      inlineSteps,
      workerNotes,
      geminiKeyLooksInvalid,
    },
  };
}

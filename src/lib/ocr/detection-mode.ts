/**
 * Stored in `organizations.ocr_detection_mode`.
 * Controls server OCR for check-in, check-out, and shared staff link photo flows.
 */
export const OCR_DETECTION_MODE_IDS = ["openai", "gemini", "tesseract"] as const;

export type OcrDetectionMode = (typeof OCR_DETECTION_MODE_IDS)[number];

/** Map legacy values (pre-009 migration) to the current three-way mode. */
const LEGACY_TO_MODE: Record<string, OcrDetectionMode> = {
  auto: "openai",
  easyocr_http: "openai",
  gemini: "gemini",
  openai: "openai",
  tesseract: "tesseract",
  tesseract_edge: "tesseract",
  tesseract_node: "tesseract",
};

export function normalizeOcrDetectionMode(raw: string | null | undefined): OcrDetectionMode {
  const v = (raw ?? "openai").trim().toLowerCase();
  if (v === "openai" || v === "gemini" || v === "tesseract") return v;
  const mapped = LEGACY_TO_MODE[v];
  if (mapped) return mapped;
  return "openai";
}

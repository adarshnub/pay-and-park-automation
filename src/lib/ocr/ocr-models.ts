/** Single source of truth for dashboard / shared-link OCR model IDs (server env overrides). */

export function getOpenAiOcrModel(): string {
  return process.env.OPENAI_OCR_MODEL?.trim() || "gpt-4o-mini";
}

export function getGeminiOcrModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
}

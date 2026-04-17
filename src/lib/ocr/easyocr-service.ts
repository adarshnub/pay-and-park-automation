import type { OcrRunResult } from "@/src/lib/ocr/pipeline";
import { normalizePlate, parseIndianPlate } from "@/src/lib/plate";

export function getEasyOcrServiceConfig(): { url: string; secret: string } | null {
  const url = process.env.OCR_SERVICE_URL?.trim();
  const secret = process.env.OCR_SERVICE_SECRET?.trim();
  if (!url || !secret) return null;
  return { url, secret };
}

export async function processWithEasyOcrService(
  imageBytes: Buffer,
  mimeType: string,
  cfg: { url: string; secret: string },
): Promise<OcrRunResult> {
  const endpoint = cfg.url.replace(/\/$/, "");
  const imageBase64 = imageBytes.toString("base64");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.secret}`,
    },
    body: JSON.stringify({
      imageBase64,
      mimeType,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const body = (await res.json()) as {
    plate?: string;
    confidence?: number;
    message?: string | null;
    error?: string;
  };

  if (!res.ok) throw new Error(body.error ?? `EasyOCR service HTTP ${res.status}`);

  const rawPlate = String(body.plate ?? "").trim().toUpperCase();
  const parsed = parseIndianPlate(rawPlate);
  const normalized = parsed.isValid ? parsed.normalized : normalizePlate(rawPlate);

  return {
    plate: normalized,
    confidence: Math.max(0, Math.min(100, Number(body.confidence ?? 0))),
    engine: "free",
    croppedPlateUrl: null,
    message: body.message ?? null,
  };
}

import {
  parseTesseractRawToPlateResult,
  preprocessImageForOcr,
  type OcrRunResult,
} from "@/src/lib/ocr/pipeline";

/**
 * Sharp preprocess in Next.js, Tesseract only on Supabase Edge (`ocr-tesseract`).
 */
export async function processWithTesseractViaEdge(
  imageBytes: Buffer,
  edgeUrl: string,
  secret: string,
): Promise<OcrRunResult> {
  let processed: Buffer;
  try {
    processed = await preprocessImageForOcr(imageBytes);
  } catch {
    processed = imageBytes;
  }

  const imageBase64 = processed.toString("base64");
  const url = edgeUrl.replace(/\/$/, "");
  // Supabase Edge gateway requires Authorization (anon JWT is enough); our OCR_EDGE_SECRET is checked inside the function.
  const supabaseAuth =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseAuth) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) for Edge Function gateway",
    );
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAuth}`,
      "x-ocr-secret": secret,
    },
    body: JSON.stringify({ imageBase64 }),
    signal: AbortSignal.timeout(55_000),
  });

  const body = (await res.json()) as {
    rawText?: string;
    confidence?: number;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(body.error ?? `Edge OCR HTTP ${res.status}`);
  }

  return parseTesseractRawToPlateResult(
    (body.rawText ?? "").trim(),
    typeof body.confidence === "number" ? body.confidence : 50,
  );
}

export function getEdgeOcrConfig(): { url: string; secret: string } | null {
  const url = process.env.SUPABASE_OCR_EDGE_URL?.trim();
  const secret = process.env.OCR_EDGE_SECRET?.trim();
  if (!url || !secret) return null;
  return { url, secret };
}

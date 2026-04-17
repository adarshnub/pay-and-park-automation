import { NextRequest, NextResponse } from "next/server";
import { processWithOpenAI, processWithTesseract } from "@/src/lib/ocr/pipeline";

export const maxDuration = 30;

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

    const imageBytes = Buffer.from(await imageFile.arrayBuffer());

    // Try OpenAI first if configured (fast + accurate)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const result = await processWithOpenAI(imageBytes, imageFile.type, openaiKey, "gpt-4o-mini");
        if (result.plate) return NextResponse.json(result);
      } catch {
        // fall through to free engine
      }
    }

    // Free path: Sharp preprocessing + Tesseract.js
    const result = await processWithTesseract(imageBytes);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OCR processing failed" },
      { status: 500 },
    );
  }
}


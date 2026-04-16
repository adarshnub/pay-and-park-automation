import { NextRequest, NextResponse } from "next/server";
import { correctOcrMisreads, normalizePlate, parseIndianPlate } from "@/src/lib/plate";

export const maxDuration = 30;
const NOISE_WORDS = ["GOVT", "KERALA", "MISSION", "IND", "OF"];

function extractPlateCandidates(rawText: string): string[] {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim().toUpperCase())
    .filter((l) => l.length >= 4);

  const pattern = /([A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{1,4})|(\d{2}\s*BH\s*\d{4}\s*[A-Z]{1,2})/g;
  const candidates = new Set<string>();

  for (const line of lines) {
    const cleanedLine = line.replace(/[^A-Z0-9\s]/g, " ");
    for (const match of cleanedLine.matchAll(pattern)) {
      const value = (match[0] ?? "").replace(/\s+/g, "");
      if (value) candidates.add(value);
    }
  }

  const merged = lines.join(" ").replace(/[^A-Z0-9\s]/g, " ");
  for (const match of merged.matchAll(pattern)) {
    const value = (match[0] ?? "").replace(/\s+/g, "");
    if (value) candidates.add(value);
  }

  // Last-resort candidate: merged text stripped of common signage words.
  const noiseFiltered = NOISE_WORDS.reduce(
    (acc, w) => acc.replace(new RegExp(w, "g"), ""),
    merged.replace(/\s+/g, ""),
  );
  if (noiseFiltered) candidates.add(noiseFiltered);

  return [...candidates];
}

function normalizeStandardTemplateCandidate(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length < 7 || cleaned.length > 11) return null;

  const letterToDigit: Record<string, string> = {
    O: "0", I: "1", S: "5", B: "8", G: "6", E: "6", Z: "2", D: "0", T: "7", L: "1", A: "4", Q: "0",
  };
  const digitToLetter: Record<string, string> = {
    "0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "7": "T", "8": "B",
  };

  for (let districtLen = 1; districtLen <= 2; districtLen++) {
    for (let seriesLen = 1; seriesLen <= 3; seriesLen++) {
      for (let numLen = 1; numLen <= 4; numLen++) {
        const totalLen = 2 + districtLen + seriesLen + numLen;
        if (totalLen !== cleaned.length) continue;
        const chars = cleaned.split("");

        for (let i = 0; i < 2; i++) {
          if (/\d/.test(chars[i]) && digitToLetter[chars[i]]) chars[i] = digitToLetter[chars[i]];
        }
        for (let i = 2; i < 2 + districtLen; i++) {
          if (/[A-Z]/.test(chars[i]) && letterToDigit[chars[i]]) chars[i] = letterToDigit[chars[i]];
        }
        for (let i = 2 + districtLen; i < 2 + districtLen + seriesLen; i++) {
          if (/\d/.test(chars[i]) && digitToLetter[chars[i]]) chars[i] = digitToLetter[chars[i]];
        }
        for (let i = 2 + districtLen + seriesLen; i < chars.length; i++) {
          if (/[A-Z]/.test(chars[i]) && letterToDigit[chars[i]]) chars[i] = letterToDigit[chars[i]];
        }

        const parsed = parseIndianPlate(chars.join(""));
        if (parsed.isValid) return parsed.normalized;
      }
    }
  }

  return null;
}

function salvageStandardPlateFromNoise(raw: string): string | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length < 6) return null;

  const letterToDigit: Record<string, string> = {
    O: "0", I: "1", S: "5", B: "8", G: "6", E: "6", Z: "2", D: "0", T: "7", L: "1", A: "4", Q: "0",
  };
  const digitToLetter: Record<string, string> = {
    "0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "7": "T", "8": "B",
  };

  let best: string | null = null;
  let bestScore = -1;

  for (let start = 0; start < cleaned.length; start++) {
    for (let districtLen = 1; districtLen <= 2; districtLen++) {
      for (let seriesLen = 1; seriesLen <= 3; seriesLen++) {
        for (let numLen = 1; numLen <= 4; numLen++) {
          const totalLen = 2 + districtLen + seriesLen + numLen;
          if (start + totalLen > cleaned.length) continue;

          const chars = cleaned.slice(start, start + totalLen).split("");

          // State (letters)
          for (let i = 0; i < 2; i++) {
            if (/\d/.test(chars[i]) && digitToLetter[chars[i]]) chars[i] = digitToLetter[chars[i]];
          }
          // District (digits)
          for (let i = 2; i < 2 + districtLen; i++) {
            if (/[A-Z]/.test(chars[i]) && letterToDigit[chars[i]]) chars[i] = letterToDigit[chars[i]];
          }
          // Series (letters)
          for (let i = 2 + districtLen; i < 2 + districtLen + seriesLen; i++) {
            if (/\d/.test(chars[i]) && digitToLetter[chars[i]]) chars[i] = digitToLetter[chars[i]];
          }
          // Number (digits)
          for (let i = 2 + districtLen + seriesLen; i < chars.length; i++) {
            if (/[A-Z]/.test(chars[i]) && letterToDigit[chars[i]]) chars[i] = letterToDigit[chars[i]];
          }

          const candidate = chars.join("");
          const parsed = parseIndianPlate(candidate);
          if (!parsed.isValid) continue;

          const score = totalLen * 10 - start;
          if (score > bestScore) {
            bestScore = score;
            best = parsed.normalized;
          }
        }
      }
    }
  }

  return best;
}

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
        const result = await processWithOpenAI(imageBytes, imageFile.type, openaiKey);
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

async function preprocessImage(imageBytes: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;

  return sharp(imageBytes)
    .grayscale()
    .normalize()
    .sharpen({ sigma: 2 })
    .threshold(140)
    .resize({ width: 1200, withoutEnlargement: true })
    .png()
    .toBuffer();
}

async function processWithTesseract(imageBytes: Buffer) {
  const Tesseract = await import("tesseract.js");

  // Preprocess for better OCR accuracy
  let processed: Buffer;
  try {
    processed = await preprocessImage(imageBytes);
  } catch {
    processed = imageBytes;
  }

  const { data } = await Tesseract.recognize(processed, "eng", {
    logger: () => {},
  });

  const rawText = data.text.trim();
  if (!rawText) {
    return {
      plate: "",
      confidence: 0,
      engine: "free",
      croppedPlateUrl: null,
      message: "Could not detect any text. Please enter the plate manually.",
    };
  }

  // Tesseract returns multiple lines; extract plate-like candidates first
  const candidates = extractPlateCandidates(rawText);

  let bestPlate = "";
  let bestConf = 0;
  let bestValid = false;

  for (const candidate of candidates) {
    const cleaned = correctOcrMisreads(candidate);
    const parsed = parseIndianPlate(cleaned);
    const fuzzy = parsed.isValid ? parsed : (() => {
      const normalized = normalizeStandardTemplateCandidate(cleaned);
      return normalized ? parseIndianPlate(normalized) : parsed;
    })();

    if (fuzzy.isValid) {
      const looksLikeStrongStandard =
        fuzzy.format === "standard" &&
        fuzzy.district.length === 2 &&
        fuzzy.series.length >= 2 &&
        fuzzy.number.length === 4;
      const lineConf = Math.round((data.confidence ?? 50) * (looksLikeStrongStandard ? 0.95 : 0.85));
      if (!bestValid || lineConf > bestConf) {
        bestPlate = fuzzy.normalized;
        bestConf = Math.min(95, lineConf);
        bestValid = true;
      }
    }
  }

  // If no valid Indian plate found, try joining all lines
  if (!bestValid) {
    const combined = rawText.replace(/\s+/g, "");
    const cleaned = correctOcrMisreads(combined);
    const parsed = parseIndianPlate(cleaned);

    if (parsed.isValid) {
      bestPlate = parsed.normalized;
      bestConf = Math.min(80, Math.round((data.confidence ?? 40) * 0.7));
      bestValid = true;
    } else {
      const salvaged = salvageStandardPlateFromNoise(cleaned);
      if (salvaged) {
        bestPlate = salvaged;
        bestConf = Math.min(55, Math.round((data.confidence ?? 30) * 0.55));
        bestValid = true;
      } else {
        bestPlate = "";
        bestConf = Math.min(25, Math.round((data.confidence ?? 30) * 0.25));
      }
    }
  }

  return {
    plate: bestPlate,
    confidence: bestConf,
    engine: "free",
    croppedPlateUrl: null,
    message: bestValid ? null : "Could not confidently extract a valid plate. Please enter manually.",
  };
}

async function processWithOpenAI(
  imageBytes: Buffer,
  mimeType: string,
  apiKey: string,
) {
  const base64 = imageBytes.toString("base64");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract the vehicle registration number plate from this image. 
This is an Indian vehicle. The plate format is typically: STATE_CODE(2 letters) DISTRICT(2 digits) SERIES(1-3 letters) NUMBER(1-4 digits).
Examples: KA 01 AB 1234, MH 02 CD 5678, DL 3C AB 1234.

Return ONLY a JSON object with:
- "plate": the extracted plate text (uppercase, no extra spaces)
- "confidence": your confidence 0-100

If you cannot detect a plate, return {"plate": "", "confidence": 0}`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType || "image/jpeg"};base64,${base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 150,
      temperature: 0,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not parse OpenAI response");

  const parsed = JSON.parse(jsonMatch[0]);
  let plate = (parsed.plate ?? "").toString().trim();

  if (plate) {
    plate = correctOcrMisreads(plate);
    const parseResult = parseIndianPlate(plate);
    plate = parseResult.isValid ? parseResult.normalized : normalizePlate(plate);
  }

  return {
    plate,
    confidence: Math.min(100, Math.max(0, parsed.confidence ?? 0)),
    engine: "openai",
    croppedPlateUrl: null,
  };
}

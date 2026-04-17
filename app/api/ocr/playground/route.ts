import { NextRequest, NextResponse } from "next/server";
import { parseIndianPlate } from "@/src/lib/plate";
import { processWithOpenAI, processWithTesseract } from "@/src/lib/ocr/pipeline";

export const maxDuration = 60;

const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"] as const;

type PlaygroundMode = "free" | "openai";

interface PlaygroundResult {
  mode: PlaygroundMode;
  method: string;
  model: string | null;
  plate: string;
  confidence: number;
  score: number;
  isValidIndianPlate: boolean;
  message: string | null;
  error: string | null;
}

function computeScore(plate: string, confidence: number): number {
  if (!plate) return 0;
  const parsed = parseIndianPlate(plate);
  const adjusted = parsed.isValid ? confidence + 10 : confidence - 20;
  return Math.max(0, Math.min(100, Math.round(adjusted)));
}

function parseJsonArray(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export async function GET() {
  return NextResponse.json({
    modes: ["free", "openai"],
    methods: [
      { id: "tesseract", mode: "free", label: "Tesseract + Sharp preprocessing" },
      { id: "vision", mode: "openai", label: "OpenAI Vision OCR" },
    ],
    models: OPENAI_MODELS,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;
    const selectedModes = parseJsonArray(formData.get("modes")) as PlaygroundMode[];
    const selectedMethods = parseJsonArray(formData.get("methods"));
    const selectedModels = parseJsonArray(formData.get("models"));

    if (!imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    if (selectedModes.length === 0) {
      return NextResponse.json({ error: "Select at least one mode" }, { status: 400 });
    }

    const imageBytes = Buffer.from(await imageFile.arrayBuffer());
    const mimeType = imageFile.type || "image/jpeg";
    const tasks: Promise<PlaygroundResult>[] = [];

    if (selectedModes.includes("free") && selectedMethods.includes("tesseract")) {
      tasks.push(
        processWithTesseract(imageBytes)
          .then((result) => {
            const parsed = parseIndianPlate(result.plate);
            return {
              mode: "free" as const,
              method: "tesseract",
              model: null,
              plate: result.plate,
              confidence: result.confidence,
              score: computeScore(result.plate, result.confidence),
              isValidIndianPlate: parsed.isValid,
              message: result.message ?? null,
              error: null,
            };
          })
          .catch((error) => ({
            mode: "free" as const,
            method: "tesseract",
            model: null,
            plate: "",
            confidence: 0,
            score: 0,
            isValidIndianPlate: false,
            message: null,
            error: error instanceof Error ? error.message : "Free OCR failed",
          })),
      );
    }

    if (selectedModes.includes("openai") && selectedMethods.includes("vision")) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        tasks.push(
          Promise.resolve({
            mode: "openai" as const,
            method: "vision",
            model: null,
            plate: "",
            confidence: 0,
            score: 0,
            isValidIndianPlate: false,
            message: null,
            error: "OPENAI_API_KEY is not configured",
          }),
        );
      } else {
        const models = selectedModels.length > 0 ? selectedModels : ["gpt-4o-mini"];
        for (const model of models) {
          tasks.push(
            processWithOpenAI(imageBytes, mimeType, apiKey, model)
              .then((result) => {
                const parsed = parseIndianPlate(result.plate);
                return {
                  mode: "openai" as const,
                  method: "vision",
                  model,
                  plate: result.plate,
                  confidence: result.confidence,
                  score: computeScore(result.plate, result.confidence),
                  isValidIndianPlate: parsed.isValid,
                  message: result.message ?? null,
                  error: null,
                };
              })
              .catch((error) => ({
                mode: "openai" as const,
                method: "vision",
                model,
                plate: "",
                confidence: 0,
                score: 0,
                isValidIndianPlate: false,
                message: null,
                error: error instanceof Error ? error.message : "OpenAI OCR failed",
              })),
          );
        }
      }
    }

    const results = await Promise.all(tasks);
    results.sort((a, b) => b.score - a.score);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Playground OCR failed" },
      { status: 500 },
    );
  }
}

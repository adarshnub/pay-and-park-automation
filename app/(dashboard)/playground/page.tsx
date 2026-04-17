"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Spinner } from "@/src/components/ui/spinner";
import { cn } from "@/src/lib/utils";
import type { OcrTokenUsage } from "@/src/lib/ocr/pipeline";
import { formatTokenUsageLine } from "@/src/lib/ocr/format-token-usage";
import { FlaskConical, Image as ImageIcon, RefreshCw, Upload, X } from "lucide-react";

interface CapabilityResponse {
  modes: string[];
  methods: Array<{ id: string; mode: string; label: string }>;
  models: string[];
  geminiModels: string[];
  openaiConfigured: boolean;
  geminiConfigured: boolean;
}

interface PlaygroundResult {
  mode: "free" | "openai" | "gemini";
  method: string;
  model: string | null;
  plate: string;
  confidence: number;
  score: number;
  isValidIndianPlate: boolean;
  message: string | null;
  error: string | null;
  tokenUsage?: OcrTokenUsage | null;
}

function scoreVariant(score: number): "success" | "warning" | "destructive" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "destructive";
}

export default function OcrPlaygroundPage() {
  const [capabilities, setCapabilities] = useState<CapabilityResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingCaps, setLoadingCaps] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<PlaygroundResult[]>([]);
  const [selectedModes, setSelectedModes] = useState<string[]>(["free", "openai", "gemini"]);
  const [selectedMethods, setSelectedMethods] = useState<string[]>([
    "tesseract",
    "vision",
    "gemini-vision",
  ]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [selectedGeminiModels, setSelectedGeminiModels] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    async function loadCapabilities() {
      setLoadingCaps(true);
      try {
        const res = await fetch("/api/ocr/playground");
        const data = (await res.json()) as CapabilityResponse;
        setCapabilities(data);
        setSelectedModels(data.models ?? []);
        setSelectedGeminiModels(data.geminiModels ?? []);
      } catch {
        setError("Failed to load playground capabilities");
      } finally {
        setLoadingCaps(false);
      }
    }
    loadCapabilities();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const openaiEnabled = useMemo(() => selectedModes.includes("openai"), [selectedModes]);
  const geminiEnabled = useMemo(() => selectedModes.includes("gemini"), [selectedModes]);

  function toggle(value: string, current: string[], setter: (v: string[]) => void) {
    setter(
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );
  }

  function onFileChange(nextFile: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
  }

  const onFileChangeRef = useRef(onFileChange);
  onFileChangeRef.current = onFileChange;

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;

      const items = e.clipboardData?.items;
      if (!items?.length) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
        const blob = item.getAsFile();
        if (!blob || blob.size === 0) continue;

        e.preventDefault();
        const ext = blob.type.includes("png")
          ? "png"
          : blob.type.includes("webp")
            ? "webp"
            : "jpg";
        const next = new File([blob], `pasted-image.${ext}`, {
          type: blob.type || "image/png",
        });
        onFileChangeRef.current(next);
        setError("");
        break;
      }
    }

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function runPlayground() {
    if (!file) {
      setError("Please upload an image first");
      return;
    }

    setRunning(true);
    setError("");
    setResults([]);

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("modes", JSON.stringify(selectedModes));
      formData.append("methods", JSON.stringify(selectedMethods));
      formData.append("models", JSON.stringify(selectedModels));
      formData.append("geminiModels", JSON.stringify(selectedGeminiModels));

      const res = await fetch("/api/ocr/playground", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Playground run failed");
      setResults((data.results ?? []) as PlaygroundResult[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Playground run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">OCR Playground</h1>
        <p className="text-sm text-muted-foreground">
          Compare all available OCR modes, methods, and models on the same image.
        </p>
      </div>

      <Card className="p-6 space-y-6">
        {loadingCaps ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner size="sm" />
            Loading available modes and models...
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium">Mode</p>
              <div className="flex flex-wrap gap-4">
                {capabilities?.modes.map((mode) => (
                  <label key={mode} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedModes.includes(mode)}
                      onChange={() => toggle(mode, selectedModes, setSelectedModes)}
                    />
                    <span className="uppercase">{mode}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Method</p>
              <div className="flex flex-wrap gap-4">
                {capabilities?.methods
                  .filter((method) => selectedModes.includes(method.mode))
                  .map((method) => (
                    <label key={method.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedMethods.includes(method.id)}
                        onChange={() => toggle(method.id, selectedMethods, setSelectedMethods)}
                      />
                      <span>{method.label}</span>
                    </label>
                  ))}
              </div>
            </div>

            {openaiEnabled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">OpenAI models</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedModels(capabilities?.models ?? [])}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedModels([])}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  {capabilities?.models.map((model) => (
                    <label key={model} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(model)}
                        onChange={() => toggle(model, selectedModels, setSelectedModels)}
                      />
                      <span>{model}</span>
                    </label>
                  ))}
                </div>
                {!capabilities?.openaiConfigured && (
                  <p className="text-xs text-warning">
                    OPENAI_API_KEY is not configured; OpenAI runs will return an error.
                  </p>
                )}
              </div>
            )}

            {geminiEnabled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Gemini models</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedGeminiModels(capabilities?.geminiModels ?? [])}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedGeminiModels([])}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  {(capabilities?.geminiModels ?? []).map((model) => (
                    <label key={model} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedGeminiModels.includes(model)}
                        onChange={() => toggle(model, selectedGeminiModels, setSelectedGeminiModels)}
                      />
                      <span>{model}</span>
                    </label>
                  ))}
                </div>
                {!capabilities?.geminiConfigured && (
                  <p className="text-xs text-warning">
                    GEMINI_API_KEY is missing or not an AI Studio key (must start with AIza); Gemini
                    runs will return an error.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3">
              <p className="text-sm font-medium">Test image</p>
              <label
                htmlFor="ocr-playground-file"
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const dropped = e.dataTransfer.files?.[0] ?? null;
                  if (dropped && dropped.type.startsWith("image/")) onFileChange(dropped);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/40 hover:bg-muted/60",
                )}
              >
                <input
                  id="ocr-playground-file"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                />
                <div className="rounded-full bg-primary/10 p-3">
                  <Upload className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {file ? "Replace test image" : "Upload or drop test image"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG, WEBP · paste from clipboard (Ctrl+V / ⌘V) anywhere on this page
                  </p>
                </div>
              </label>

              {previewUrl && file && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => onFileChange(null)}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <img
                      src={previewUrl}
                      alt="OCR test"
                      className="h-auto max-h-72 w-full object-contain bg-muted"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button onClick={runPlayground} disabled={running || !file}>
                {running ? (
                  <>
                    <Spinner size="sm" className="mr-2 text-primary-foreground" />
                    Running all selected...
                  </>
                ) : (
                  <>
                    <FlaskConical className="mr-2 h-4 w-4" />
                    Run extraction
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                disabled={running}
                onClick={() => {
                  setResults([]);
                  setError("");
                  onFileChange(null);
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Results</h2>
          <Badge variant="outline">{results.length} run(s)</Badge>
        </div>

        {results.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            Run the playground to compare extraction outputs.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {results.map((result, idx) => (
              <div key={`${result.mode}-${result.model}-${idx}`} className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{result.mode}</Badge>
                    <Badge variant="outline">{result.method}</Badge>
                    {result.model && <Badge variant="outline">{result.model}</Badge>}
                  </div>
                  <Badge variant={scoreVariant(result.score)}>Score: {result.score}</Badge>
                </div>

                <p className="text-xs text-muted-foreground">Extracted plate</p>
                <p className="rounded bg-muted px-3 py-2 font-mono text-base">
                  {result.plate || "(empty)"}
                </p>

                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Confidence: {result.confidence}%</span>
                  <span>Valid Indian pattern: {result.isValidIndianPlate ? "Yes" : "No"}</span>
                </div>

                {result.error && (
                  <p className="text-xs text-destructive">{result.error}</p>
                )}
                {!result.error && result.message && (
                  <p className="text-xs text-warning">{result.message}</p>
                )}
                {result.tokenUsage && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Tokens:</span>{" "}
                    <span className="font-mono">{formatTokenUsageLine(result.tokenUsage)}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

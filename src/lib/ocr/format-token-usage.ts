import type { OcrTokenUsage } from "@/src/lib/ocr/pipeline";

export function formatTokenUsageLine(u: OcrTokenUsage): string {
  const p = u.promptTokens;
  const c = u.completionTokens;
  const t = u.totalTokens;
  const inner =
    t != null
      ? `${t} total`
      : [p != null ? `${p} prompt` : null, c != null ? `${c} output` : null].filter(Boolean).join(" + ") ||
        "tokens n/a";
  return `${u.provider} · ${u.model} · ${inner}`;
}

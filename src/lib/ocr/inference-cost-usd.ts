/**
 * Approximate USD cost for logged OCR inference (OpenAI / Gemini vision).
 * Rates are list-price estimates for budgeting; real invoices use your provider account.
 * Update when you change default models or when providers publish new prices.
 *
 * @see https://openai.com/pricing
 * @see https://ai.google.dev/pricing
 */

export interface InferenceCostEstimate {
  usd: number;
  /** True when the model string did not match a known SKU and a default tier was used */
  usedFallbackRates: boolean;
  /** Short note for tooltips, e.g. "gpt-4o-mini" */
  rateKey: string;
}

type RatePair = { inputPerMillion: number; outputPerMillion: number; key: string };

function findOpenAiRates(model: string): RatePair | null {
  const m = model.toLowerCase();
  if (m.includes("gpt-4o-mini")) {
    return { inputPerMillion: 0.15, outputPerMillion: 0.6, key: "gpt-4o-mini" };
  }
  if (m.includes("gpt-4.1") && m.includes("mini")) {
    return { inputPerMillion: 0.4, outputPerMillion: 1.6, key: "gpt-4.1-mini (est.)" };
  }
  if (m.includes("gpt-4.1")) {
    return { inputPerMillion: 2, outputPerMillion: 8, key: "gpt-4.1 (est.)" };
  }
  if (m.includes("gpt-4o") && !m.includes("mini")) {
    return { inputPerMillion: 2.5, outputPerMillion: 10, key: "gpt-4o" };
  }
  if (m.includes("gpt-3.5")) {
    return { inputPerMillion: 0.5, outputPerMillion: 1.5, key: "gpt-3.5" };
  }
  if (m.includes("o1-mini")) {
    return { inputPerMillion: 3, outputPerMillion: 12, key: "o1-mini (est.)" };
  }
  if (m.includes("o3-mini")) {
    return { inputPerMillion: 1.1, outputPerMillion: 4.4, key: "o3-mini (est.)" };
  }
  return null;
}

function findGeminiRates(model: string): RatePair | null {
  const m = model.toLowerCase();
  if (m.includes("gemini-2.0-flash") || m.includes("gemini-2.0-flash-lite")) {
    return { inputPerMillion: 0.1, outputPerMillion: 0.4, key: "gemini-2.0-flash" };
  }
  if (m.includes("gemini-2.5-flash")) {
    return { inputPerMillion: 0.15, outputPerMillion: 0.6, key: "gemini-2.5-flash (est.)" };
  }
  if (m.includes("gemini-1.5-flash")) {
    return { inputPerMillion: 0.075, outputPerMillion: 0.3, key: "gemini-1.5-flash" };
  }
  if (m.includes("gemini-1.5-pro")) {
    return { inputPerMillion: 1.25, outputPerMillion: 5, key: "gemini-1.5-pro" };
  }
  if (m.includes("gemini-pro")) {
    return { inputPerMillion: 0.5, outputPerMillion: 1.5, key: "gemini-pro (est.)" };
  }
  return null;
}

/**
 * Returns USD estimate from prompt + completion token counts, or null if unknown provider
 * or insufficient token data.
 */
export function estimateInferenceCostUsd(
  provider: string,
  model: string | null,
  promptTokens: number,
  completionTokens: number,
): InferenceCostEstimate | null {
  const prov = provider.toLowerCase().trim();
  const mod = (model ?? "").trim();

  let rates: RatePair | null = null;
  let usedFallback = false;

  if (prov === "openai") {
    rates = findOpenAiRates(mod);
    if (!rates) {
      rates = { inputPerMillion: 0.15, outputPerMillion: 0.6, key: "gpt-4o-mini (fallback)" };
      usedFallback = true;
    }
  } else if (prov === "google" || prov === "gemini") {
    rates = findGeminiRates(mod);
    if (!rates) {
      rates = { inputPerMillion: 0.1, outputPerMillion: 0.4, key: "gemini-2.0-flash (fallback)" };
      usedFallback = true;
    }
  } else {
    return null;
  }

  const usd =
    (promptTokens / 1_000_000) * rates.inputPerMillion +
    (completionTokens / 1_000_000) * rates.outputPerMillion;

  return { usd, usedFallbackRates: usedFallback, rateKey: rates.key };
}

/** Format small dollar amounts without scientific notation */
export function formatUsdEstimate(usd: number): string {
  const abs = Math.abs(usd);
  if (abs > 0 && abs < 0.0001) return `~$${usd.toFixed(6)}`;
  if (abs < 0.01) return `~$${usd.toFixed(4)}`;
  if (abs < 1) return `~$${usd.toFixed(3)}`;
  return `~$${usd.toFixed(2)}`;
}

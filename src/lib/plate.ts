/**
 * Indian vehicle registration plate normalization.
 *
 * Supports two formats:
 *
 * 1. Standard: XX 00 XX 0000
 *    - 2-letter state code (KA, MH, DL, etc.)
 *    - 2-digit district code
 *    - 1-3 letter series
 *    - 1-4 digit number
 *
 * 2. BH-series (Bharat): 00 BH 0000 XX
 *    - 2-digit year of registration
 *    - "BH" literal
 *    - 4-digit number
 *    - 1-2 letter fuel/vehicle type code
 */

const INDIAN_STATE_CODES = new Set([
  "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "GA",
  "GJ", "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD", "MH",
  "ML", "MN", "MP", "MZ", "NL", "OD", "OR", "PB", "PY", "RJ",
  "SK", "TN", "TR", "TS", "UK", "UP", "WB",
]);

const STANDARD_REGEX = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/;
const BH_REGEX = /^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/;

export interface ParsedPlate {
  normalized: string;
  state: string;
  district: string;
  series: string;
  number: string;
  format: "standard" | "bharat" | "unknown";
  isValid: boolean;
}

export function normalizePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function parseIndianPlate(raw: string): ParsedPlate {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const invalid: ParsedPlate = {
    normalized: cleaned, state: "", district: "",
    series: "", number: "", format: "unknown", isValid: false,
  };

  // Try BH-series first (22BH6517A)
  const bhMatch = cleaned.match(BH_REGEX);
  if (bhMatch) {
    const [, year, bh, num, code] = bhMatch;
    const yearNum = parseInt(year, 10);
    if (yearNum >= 20 && yearNum <= 40) {
      return {
        normalized: `${year}BH${num}${code}`,
        state: "BH",
        district: year,
        series: code,
        number: num,
        format: "bharat",
        isValid: true,
      };
    }
  }

  // Try standard format (KA01AB1234)
  const stdMatch = cleaned.match(STANDARD_REGEX);
  if (stdMatch) {
    const [, state, district, series, num] = stdMatch;
    const isValid = INDIAN_STATE_CODES.has(state) && num.length >= 1;

    return {
      normalized: `${state}${district.padStart(2, "0")}${series}${num}`,
      state,
      district: district.padStart(2, "0"),
      series,
      number: num,
      format: "standard",
      isValid,
    };
  }

  return invalid;
}

/**
 * Fix common OCR misreads in a context-aware way.
 * Only corrects characters in positions where we expect digits
 * but found letters (or vice versa), based on likely plate format.
 */
export function correctOcrMisreads(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // If it already parses, don't mess with it
  const directParse = parseIndianPlate(cleaned);
  if (directParse.isValid) return cleaned;

  const chars = cleaned.split("");
  if (chars.length < 6) return cleaned;

  const letterToDigit: Record<string, string> = {
    O: "0", I: "1", S: "5", B: "8", G: "6", E: "6", Z: "2", D: "0", T: "7", L: "1",
  };
  const digitToLetter: Record<string, string> = {
    "0": "O", "1": "I", "5": "S", "8": "B", "6": "G", "2": "Z",
  };

  // Try interpreting as standard: LL DD LLL DDDD
  if (/^[A-Z]/.test(chars[0] ?? "")) {
    const attempt = [...chars];
    // Positions 2-3 should be digits
    for (let i = 2; i < 4 && i < attempt.length; i++) {
      if (/[A-Z]/.test(attempt[i]) && letterToDigit[attempt[i]]) {
        attempt[i] = letterToDigit[attempt[i]];
      }
    }
    const result = parseIndianPlate(attempt.join(""));
    if (result.isValid) return attempt.join("");
  }

  // Try interpreting as BH-series: DD BH DDDD L
  if (/^\d/.test(chars[0] ?? "")) {
    const attempt = [...chars];
    // Positions 0-1 should be digits
    for (let i = 0; i < 2 && i < attempt.length; i++) {
      if (/[A-Z]/.test(attempt[i]) && letterToDigit[attempt[i]]) {
        attempt[i] = letterToDigit[attempt[i]];
      }
    }
    // Positions 2-3 should be "BH"
    if (attempt.length >= 4 && /\d/.test(attempt[2]) && digitToLetter[attempt[2]]) {
      attempt[2] = digitToLetter[attempt[2]];
    }
    // Positions 4-7 should be digits
    for (let i = 4; i < 8 && i < attempt.length; i++) {
      if (/[A-Z]/.test(attempt[i]) && letterToDigit[attempt[i]]) {
        attempt[i] = letterToDigit[attempt[i]];
      }
    }
    const result = parseIndianPlate(attempt.join(""));
    if (result.isValid) return attempt.join("");
  }

  return cleaned;
}

export function formatPlateDisplay(normalized: string): string {
  // BH-series: 22BH6517A → 22 BH 6517 A
  const bhMatch = normalized.match(/^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/);
  if (bhMatch) return `${bhMatch[1]} ${bhMatch[2]} ${bhMatch[3]} ${bhMatch[4]}`;

  // Standard: KA01AB1234 → KA 01 AB 1234
  const stdMatch = normalized.match(/^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{1,4})$/);
  if (stdMatch) return `${stdMatch[1]} ${stdMatch[2]} ${stdMatch[3]} ${stdMatch[4]}`;

  return normalized;
}

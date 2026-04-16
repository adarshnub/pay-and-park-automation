"""
Indian vehicle plate normalization and validation.
Mirrors the logic in src/lib/plate.ts for consistency.
"""

import re

INDIAN_STATE_CODES = {
    "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "GA",
    "GJ", "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD", "MH",
    "ML", "MN", "MP", "MZ", "NL", "OD", "OR", "PB", "PY", "RJ",
    "SK", "TN", "TR", "TS", "UK", "UP", "WB",
}

OCR_DIGIT_CORRECTIONS = {
    "O": "0", "I": "1", "S": "5", "B": "8", "G": "6", "E": "6", "Z": "2", "D": "0",
}

PLATE_PATTERN = re.compile(r"^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$")


def normalize_plate(raw: str) -> str:
    cleaned = re.sub(r"[^A-Z0-9]", "", raw.upper())
    return cleaned


def parse_indian_plate(raw: str):
    cleaned = normalize_plate(raw)
    m = PLATE_PATTERN.match(cleaned)
    if not m:
        return {"normalized": cleaned, "is_valid": False}

    state, district, series, num = m.groups()
    is_valid = state in INDIAN_STATE_CODES and len(district) <= 2 and len(num) >= 1
    normalized = f"{state}{district.zfill(2)}{series}{num}"
    return {"normalized": normalized, "is_valid": is_valid}


def correct_ocr_misreads(raw: str) -> str:
    chars = list(re.sub(r"[^A-Z0-9]", "", raw.upper()))
    if len(chars) >= 6:
        for i in range(2, min(4, len(chars))):
            if chars[i] in OCR_DIGIT_CORRECTIONS and chars[i].isalpha():
                chars[i] = OCR_DIGIT_CORRECTIONS[chars[i]]
    return "".join(chars)

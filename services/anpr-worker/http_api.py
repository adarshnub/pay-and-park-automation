"""
HTTP API for EasyOCR service-to-service calls from Next.js.

Run:
  uvicorn http_api:app --host 0.0.0.0 --port 8000
"""

import base64
import re
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

import config
from ocr_engine import run_ocr
from plate_utils import correct_ocr_misreads, parse_indian_plate

app = FastAPI(title="ANPR EasyOCR API")


class OcrRequest(BaseModel):
    imageBase64: str
    mimeType: str | None = None


NOISE_WORDS = ("GOVT", "KERALA", "MISSION", "MALAYALA", "IND", "OF")
PLATE_PATTERN = re.compile(
    r"([A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{1,4})|(\d{2}\s*BH\s*\d{4}\s*[A-Z]{1,2})"
)
LETTER_TO_DIGIT = {"O": "0", "I": "1", "S": "5", "B": "8", "G": "6", "E": "6", "Z": "2", "D": "0", "T": "7", "L": "1", "A": "4", "Q": "0"}
DIGIT_TO_LETTER = {"0": "O", "1": "I", "2": "Z", "4": "A", "5": "S", "6": "G", "7": "T", "8": "B"}


def _extract_plate_candidates(texts: list[str]) -> list[str]:
    candidates: list[str] = []
    seen = set()

    lines = [t.strip().upper() for t in texts if t and len(t.strip()) >= 4]

    def add(value: str) -> None:
        v = re.sub(r"\s+", "", value.strip().upper())
        if v and v not in seen:
            seen.add(v)
            candidates.append(v)

    for line in lines:
        cleaned = re.sub(r"[^A-Z0-9\s]", " ", line)
        for m in PLATE_PATTERN.finditer(cleaned):
            add(m.group(0))
        # keep entire line too; some OCR outputs contiguous text without clear boundaries
        add(cleaned)

    merged = re.sub(r"[^A-Z0-9\s]", " ", " ".join(lines))
    for m in PLATE_PATTERN.finditer(merged):
        add(m.group(0))

    noise_filtered = re.sub(r"\s+", "", merged)
    for w in NOISE_WORDS:
        noise_filtered = noise_filtered.replace(w, "")
    add(noise_filtered)

    return candidates


def _state_fix(candidate: str) -> str:
    # common first-two-char OCR mistakes for Indian state codes
    if candidate.startswith("QL"):
        return "KL" + candidate[2:]
    if candidate.startswith("0L"):
        return "DL" + candidate[2:]
    if candidate.startswith("TN") or candidate.startswith("KA") or candidate.startswith("KL"):
        return candidate
    # generic fixes for first two letters
    chars = list(candidate)
    if len(chars) >= 2:
        if chars[0] == "0":
            chars[0] = "D"
        if chars[1] == "0":
            chars[1] = "D"
    return "".join(chars)


def _normalize_template_candidate(raw: str) -> str | None:
    cleaned = re.sub(r"[^A-Z0-9]", "", raw.upper())
    if len(cleaned) < 7 or len(cleaned) > 11:
        return None

    best: str | None = None
    best_score = -1

    for district_len in (2, 1):
        for series_len in (2, 3, 1):
            for num_len in (4, 3, 2, 1):
                total = 2 + district_len + series_len + num_len
                if total != len(cleaned):
                    continue
                chars = list(cleaned)
                conversions = 0

                # state letters
                for i in range(0, 2):
                    if chars[i].isdigit() and chars[i] in DIGIT_TO_LETTER:
                        chars[i] = DIGIT_TO_LETTER[chars[i]]
                        conversions += 1
                # district digits
                for i in range(2, 2 + district_len):
                    if chars[i].isalpha() and chars[i] in LETTER_TO_DIGIT:
                        chars[i] = LETTER_TO_DIGIT[chars[i]]
                        conversions += 1
                # series letters
                for i in range(2 + district_len, 2 + district_len + series_len):
                    if chars[i].isdigit() and chars[i] in DIGIT_TO_LETTER:
                        chars[i] = DIGIT_TO_LETTER[chars[i]]
                        conversions += 1
                # number digits
                for i in range(2 + district_len + series_len, len(chars)):
                    if chars[i].isalpha() and chars[i] in LETTER_TO_DIGIT:
                        chars[i] = LETTER_TO_DIGIT[chars[i]]
                        conversions += 1

                candidate = _state_fix("".join(chars))
                parsed = parse_indian_plate(candidate)
                if parsed["is_valid"]:
                    # Prefer realistic plate structure with minimum OCR coercion.
                    # This prevents outputs like KL65AT73 for an actual KL65A773 plate.
                    score = (
                        (30 if district_len == 2 else 0)
                        + (10 if series_len >= 2 else 0)
                        + (40 if num_len == 4 else 25 if num_len == 3 else 8)
                        + (10 if len(cleaned) >= 9 else 0)
                        + total
                        - (14 * conversions)
                    )
                    if score > best_score:
                        best_score = score
                        best = parsed["normalized"]
    return best


def _salvage_from_noise(raw: str) -> str | None:
    cleaned = re.sub(r"[^A-Z0-9]", "", raw.upper())
    if len(cleaned) < 6:
        return None

    best = None
    best_score = -1
    for start in range(0, len(cleaned)):
        for district_len in (1, 2):
            for series_len in (1, 2, 3):
                for num_len in (1, 2, 3, 4):
                    total = 2 + district_len + series_len + num_len
                    if start + total > len(cleaned):
                        continue
                    maybe = _normalize_template_candidate(cleaned[start:start + total])
                    if maybe:
                        score = total * 10 - start
                        if score > best_score:
                            best_score = score
                            best = maybe
    return best


def _plate_strength(plate: str) -> int:
    m = re.match(r"^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{1,4})$", plate)
    if not m:
        return 0
    _, district, series, number = m.groups()
    score = 0
    if len(district) == 2:
        score += 25
    if len(series) >= 2:
        score += 30
    elif len(series) == 1:
        score += 10
    if len(number) == 4:
        score += 35
    elif len(number) == 3:
        score += 15
    else:
        score += 5
    score += len(plate)
    return score


def _extract_best_plate(texts: list[str], confidences: list[float]) -> tuple[str, float]:
    best_plate = ""
    best_confidence = 0.0

    candidates = _extract_plate_candidates(texts)
    base_conf = (sum(confidences) / len(confidences) * 100) if confidences else 0

    for idx, candidate in enumerate(candidates):
        normalized = _normalize_template_candidate(candidate)
        if normalized:
            score = max(45.0, base_conf - idx * 2.0)
            if score > best_confidence:
                best_plate = normalized
                best_confidence = score
            continue

        corrected = correct_ocr_misreads(_state_fix(candidate))
        parsed = parse_indian_plate(corrected)
        if parsed["is_valid"]:
            score = max(40.0, base_conf - idx * 2.5)
            if score > best_confidence:
                best_plate = parsed["normalized"]
                best_confidence = score

    combined_text = "".join(texts)
    if combined_text:
        salvaged = _salvage_from_noise(combined_text)
        if salvaged:
            if (
                not best_plate
                or _plate_strength(salvaged) >= _plate_strength(best_plate) + 10
                or (len(best_plate) < 9 and len(salvaged) >= 9)
            ):
                best_plate = salvaged
                best_confidence = max(best_confidence, min(78.0, base_conf + 5))

    if best_plate:
        return best_plate, min(98.0, best_confidence)

    for text, conf in zip(texts, confidences):
        corrected = correct_ocr_misreads(_state_fix(text.upper()))
        parsed = parse_indian_plate(corrected)
        if parsed["is_valid"] and conf > best_confidence:
            best_plate = parsed["normalized"]
            best_confidence = conf * 100

    if not best_plate and texts:
        combined = combined_text
        salvaged = _salvage_from_noise(combined)
        if salvaged:
            return salvaged, min(70.0, base_conf)
        corrected = correct_ocr_misreads(_state_fix(combined.upper()))
        parsed = parse_indian_plate(corrected)
        best_plate = parsed["normalized"]
        best_confidence = (sum(confidences) / len(confidences) * 100) if confidences else 0

    return best_plate, best_confidence


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ocr")
def ocr(req: OcrRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    expected = config.OCR_SERVICE_SECRET
    if not expected:
        raise HTTPException(status_code=500, detail="OCR_SERVICE_SECRET not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid bearer token")

    try:
        image_bytes = base64.b64decode(req.imageBase64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64: {exc}") from exc

    try:
        ocr_result = run_ocr(image_bytes)
        texts = ocr_result.get("texts", [])
        confidences = ocr_result.get("confidences", [])
        plate, confidence = _extract_best_plate(texts, confidences)
        return {
            "plate": plate,
            "confidence": confidence,
            "engine": "free",
            "message": None if plate else "Could not confidently extract a valid plate.",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

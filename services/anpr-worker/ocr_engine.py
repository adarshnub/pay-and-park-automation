"""
Free OCR engine using EasyOCR for Indian number plate detection.

EasyOCR is the primary free path. It runs inference on the worker
process, not inside Next.js, so latency and memory spikes don't
affect web traffic.
"""

import io
import logging
from typing import Optional

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# Lazy-loaded singleton so model downloads only happen once
_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        import easyocr
        logger.info("Loading EasyOCR model (first run downloads ~100MB)...")
        _reader = easyocr.Reader(["en"], gpu=False)
        logger.info("EasyOCR model loaded.")
    return _reader


def preprocess_plate_region(image_bytes: bytes) -> np.ndarray:
    """Convert raw image bytes to a preprocessed OpenCV array optimized for OCR."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Increase contrast with CLAHE
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Denoise
    denoised = cv2.fastNlMeansDenoising(enhanced, h=10)

    return denoised


def detect_plate_region(image_bytes: bytes) -> Optional[bytes]:
    """
    Attempt to locate and crop the number plate region.
    Returns cropped plate image bytes if found, None otherwise.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Bilateral filter to reduce noise while keeping edges
    filtered = cv2.bilateralFilter(gray, 11, 17, 17)

    # Edge detection
    edged = cv2.Canny(filtered, 30, 200)

    # Find contours
    contours, _ = cv2.findContours(edged, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    plate_contour = None
    for contour in contours:
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.018 * peri, True)
        if len(approx) == 4:
            plate_contour = approx
            break

    if plate_contour is None:
        return None

    x, y, w, h = cv2.boundingRect(plate_contour)
    aspect_ratio = w / max(h, 1)
    if aspect_ratio < 1.5 or aspect_ratio > 8.0:
        return None

    # Add padding
    pad = 10
    y1 = max(0, y - pad)
    y2 = min(img.shape[0], y + h + pad)
    x1 = max(0, x - pad)
    x2 = min(img.shape[1], x + w + pad)
    cropped = img[y1:y2, x1:x2]

    success, buf = cv2.imencode(".jpg", cropped)
    return bytes(buf) if success else None


def run_ocr(image_bytes: bytes) -> dict:
    """
    Run EasyOCR on the image bytes.
    Returns {texts: list[str], confidences: list[float], raw_results: list}.
    """
    reader = _get_reader()

    # Try plate region first, fall back to full image
    plate_bytes = detect_plate_region(image_bytes)
    target_bytes = plate_bytes or image_bytes

    processed = preprocess_plate_region(target_bytes)
    results = reader.readtext(processed)

    texts = []
    confidences = []
    for bbox, text, conf in results:
        texts.append(text)
        confidences.append(float(conf))

    return {
        "texts": texts,
        "confidences": confidences,
        "used_cropped": plate_bytes is not None,
        "cropped_plate_bytes": plate_bytes,
    }

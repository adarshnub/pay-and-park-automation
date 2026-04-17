"""
ANPR Worker: polls Supabase for pending OCR jobs, processes them
with EasyOCR (free), and optionally falls back to OpenAI Vision.

Run: python worker.py
"""

import io
import json
import logging
import time
from datetime import datetime, timezone

from supabase import create_client

import config
from ocr_engine import run_ocr
from plate_utils import correct_ocr_misreads, normalize_plate, parse_indian_plate

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


def get_supabase():
    return create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)


def fetch_pending_jobs(supabase, limit=5):
    result = (
        supabase.table("ocr_jobs")
        .select("*, visit_images(storage_path)")
        .eq("status", "pending")
        .order("created_at")
        .limit(limit)
        .execute()
    )
    return result.data or []


def download_image(supabase, storage_path: str) -> bytes:
    return supabase.storage.from_(config.STORAGE_BUCKET).download(storage_path)


def upload_cropped_plate(supabase, job_id: str, plate_bytes: bytes) -> str:
    path = f"cropped-plates/{job_id}.jpg"
    supabase.storage.from_(config.STORAGE_BUCKET).upload(
        path, plate_bytes, {"content-type": "image/jpeg"}
    )
    return path


def update_job_processing(supabase, job_id: str):
    supabase.table("ocr_jobs").update({"status": "processing"}).eq("id", job_id).execute()


def update_job_completed(supabase, job_id: str, plate: str, confidence: float, engine: str, cropped_path: str | None):
    supabase.table("ocr_jobs").update({
        "status": "completed",
        "raw_detected_plate": plate,
        "confidence": confidence,
        "engine_used": engine,
        "cropped_plate_path": cropped_path,
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()


def update_job_failed(supabase, job_id: str, error: str):
    supabase.table("ocr_jobs").update({
        "status": "failed",
        "error_message": error,
        "processed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()


def try_openai_fallback(image_bytes: bytes) -> dict | None:
    """Attempt OpenAI Vision API if configured."""
    if not config.OPENAI_API_KEY:
        return None

    import base64
    import requests

    b64 = base64.b64encode(image_bytes).decode()

    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {config.OPENAI_API_KEY}",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "Extract the vehicle registration number plate from this image. "
                                    "Indian format: STATE(2 letters) DISTRICT(2 digits) SERIES(1-3 letters) NUMBER(1-4 digits). "
                                    'Return ONLY JSON: {"plate": "...", "confidence": 0-100}'
                                ),
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{b64}",
                                    "detail": "high",
                                },
                            },
                        ],
                    }
                ],
                "max_tokens": 150,
                "temperature": 0,
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        import re
        m = re.search(r"\{.*\}", content, re.DOTALL)
        if m:
            parsed = json.loads(m.group())
            return {"plate": parsed.get("plate", ""), "confidence": parsed.get("confidence", 0)}
    except Exception as e:
        logger.warning(f"OpenAI fallback failed: {e}")

    return None


def process_job(supabase, job):
    job_id = job["id"]
    storage_path = job.get("visit_images", {}).get("storage_path")

    if not storage_path:
        update_job_failed(supabase, job_id, "No image storage path")
        return

    logger.info(f"Processing job {job_id}: {storage_path}")
    update_job_processing(supabase, job_id)

    try:
        image_bytes = download_image(supabase, storage_path)
    except Exception as e:
        update_job_failed(supabase, job_id, f"Image download failed: {e}")
        return

    # Phase 1: Free OCR with EasyOCR
    try:
        ocr_result = run_ocr(image_bytes)
        texts = ocr_result["texts"]
        confidences = ocr_result["confidences"]

        best_plate = ""
        best_confidence = 0.0

        for text, conf in zip(texts, confidences):
            corrected = correct_ocr_misreads(text)
            parsed = parse_indian_plate(corrected)
            if parsed["is_valid"]:
                if conf > best_confidence:
                    best_plate = parsed["normalized"]
                    best_confidence = conf * 100

        if not best_plate and texts:
            combined = "".join(texts)
            corrected = correct_ocr_misreads(combined)
            parsed = parse_indian_plate(corrected)
            best_plate = parsed["normalized"]
            best_confidence = (sum(confidences) / len(confidences) * 100) if confidences else 0

        engine = "free"

        # Phase 2: OpenAI fallback if confidence is low
        if best_confidence < config.OCR_CONFIDENCE_THRESHOLD:
            openai_result = try_openai_fallback(image_bytes)
            if openai_result and openai_result["confidence"] > best_confidence:
                corrected = correct_ocr_misreads(openai_result["plate"])
                parsed = parse_indian_plate(corrected)
                best_plate = parsed["normalized"]
                best_confidence = openai_result["confidence"]
                engine = "openai"

        # Upload cropped plate if available
        cropped_path = None
        if ocr_result.get("cropped_plate_bytes"):
            try:
                cropped_path = upload_cropped_plate(supabase, job_id, ocr_result["cropped_plate_bytes"])
            except Exception:
                pass

        update_job_completed(supabase, job_id, best_plate, best_confidence, engine, cropped_path)
        logger.info(f"Job {job_id} completed: plate={best_plate}, conf={best_confidence:.1f}%, engine={engine}")

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}", exc_info=True)
        update_job_failed(supabase, job_id, str(e))


def main():
    logger.info("ANPR Worker started")
    logger.info(f"Supabase URL: {config.SUPABASE_URL[:30]}...")
    logger.info(f"OpenAI fallback: {'enabled' if config.OPENAI_API_KEY else 'disabled'}")
    logger.info(f"Confidence threshold: {config.OCR_CONFIDENCE_THRESHOLD}%")
    logger.info(f"Poll interval: {config.POLL_INTERVAL_SECONDS}s")

    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
        logger.error(
            "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the repo root .env.local "
            "(or legacy SUPABASE_URL / SUPABASE_SERVICE_KEY)"
        )
        return

    supabase = get_supabase()

    while True:
        try:
            jobs = fetch_pending_jobs(supabase)
            if jobs:
                logger.info(f"Found {len(jobs)} pending job(s)")
                for job in jobs:
                    process_job(supabase, job)
            else:
                logger.debug("No pending jobs")
        except Exception as e:
            logger.error(f"Poll cycle error: {e}", exc_info=True)

        time.sleep(config.POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()

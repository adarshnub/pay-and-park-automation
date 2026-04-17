-- Reduce organizations.ocr_detection_mode to openai | gemini | tesseract (UI + server).

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_ocr_detection_mode_check;

UPDATE organizations
SET ocr_detection_mode = CASE
  WHEN ocr_detection_mode = 'gemini' THEN 'gemini'
  WHEN ocr_detection_mode = 'openai' THEN 'openai'
  WHEN ocr_detection_mode IN ('tesseract_edge', 'tesseract_node', 'tesseract') THEN 'tesseract'
  ELSE 'openai'
END;

ALTER TABLE organizations ALTER COLUMN ocr_detection_mode SET DEFAULT 'openai';

ALTER TABLE organizations
  ADD CONSTRAINT organizations_ocr_detection_mode_check
  CHECK (ocr_detection_mode IN ('openai', 'gemini', 'tesseract'));

COMMENT ON COLUMN organizations.ocr_detection_mode IS
  'OCR for /api/ocr/process and /api/shared-lot/process-image: openai | gemini | tesseract (Edge Tesseract if configured, else Node Tesseract.js).';

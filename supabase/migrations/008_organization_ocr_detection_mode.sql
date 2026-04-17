-- Per-organization preference for which OCR path runs on dashboard + shared-link image detection.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ocr_detection_mode text NOT NULL DEFAULT 'auto';

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_ocr_detection_mode_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_ocr_detection_mode_check
  CHECK (
    ocr_detection_mode IN (
      'auto',
      'easyocr_http',
      'gemini',
      'openai',
      'tesseract_edge',
      'tesseract_node'
    )
  );

COMMENT ON COLUMN organizations.ocr_detection_mode IS
  'OCR strategy for /api/ocr/process and /api/shared-lot/process-image: auto | easyocr_http | gemini | openai | tesseract_edge | tesseract_node';

-- Token / usage metadata for paid OCR (OpenAI, Gemini). Written by Next.js API routes (service role).

CREATE TABLE ocr_inference_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parking_lot_id uuid REFERENCES parking_lots(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('dashboard', 'shared_lot')),
  provider text NOT NULL CHECK (provider IN ('openai', 'gemini')),
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ocr_inference_logs_org_created_idx
  ON ocr_inference_logs (organization_id, created_at DESC);

ALTER TABLE ocr_inference_logs ENABLE ROW LEVEL SECURITY;

-- Dashboard: org members can read their org's logs (inserts use service role only).
CREATE POLICY ocr_inference_logs_select ON ocr_inference_logs FOR SELECT
  USING (organization_id = auth_user_org_id());

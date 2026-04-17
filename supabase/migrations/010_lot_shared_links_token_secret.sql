-- Store URL token for dashboard "copy link" (RLS: org members only).
-- Legacy rows may have NULL until the link is rotated once or recreated.
ALTER TABLE lot_shared_links
ADD COLUMN IF NOT EXISTS token_secret TEXT;

COMMENT ON COLUMN lot_shared_links.token_secret IS 'Raw /s/[token] segment; only hash was stored before migration 010.';

-- ============================================================
-- Per-lot shareable links (token-based, mobile staff access)
-- Plaintext token is shown once at creation; only token_hash stored.
-- ============================================================

CREATE TABLE lot_shared_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parking_lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Staff link',
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lot_shared_links_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX idx_lot_shared_links_lot ON lot_shared_links(parking_lot_id);
CREATE INDEX idx_lot_shared_links_org ON lot_shared_links(organization_id);

ALTER TABLE lot_shared_links ENABLE ROW LEVEL SECURITY;

-- Org members can manage links for lots in their org (owner/admin for write)
CREATE POLICY lot_shared_links_select ON lot_shared_links FOR SELECT
  USING (organization_id = auth_user_org_id());

CREATE POLICY lot_shared_links_insert ON lot_shared_links FOR INSERT
  WITH CHECK (
    organization_id = auth_user_org_id()
    AND parking_lot_id IN (SELECT id FROM parking_lots WHERE organization_id = auth_user_org_id())
    AND auth_user_role() IN ('owner', 'admin')
  );

CREATE POLICY lot_shared_links_update ON lot_shared_links FOR UPDATE
  USING (
    organization_id = auth_user_org_id()
    AND auth_user_role() IN ('owner', 'admin')
  );

CREATE POLICY lot_shared_links_delete ON lot_shared_links FOR DELETE
  USING (
    organization_id = auth_user_org_id()
    AND auth_user_role() IN ('owner', 'admin')
  );

CREATE TRIGGER lot_shared_links_updated_at
  BEFORE UPDATE ON lot_shared_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Allow shared-link (unauthenticated) confirmations without a profile
ALTER TABLE plate_reviews ALTER COLUMN confirmed_by DROP NOT NULL;

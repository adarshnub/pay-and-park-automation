-- Staff-reported disputes when a vehicle is checked in at another lot
-- but someone tries to check it in at this lot (shared link / kiosk).

CREATE TABLE check_in_disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  intended_parking_lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  conflicting_visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  normalized_plate TEXT NOT NULL,
  employee_note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  lot_shared_link_id UUID REFERENCES lot_shared_links(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_check_in_disputes_org ON check_in_disputes(organization_id);
CREATE INDEX idx_check_in_disputes_status ON check_in_disputes(status);
CREATE INDEX idx_check_in_disputes_created ON check_in_disputes(created_at DESC);

ALTER TABLE check_in_disputes ENABLE ROW LEVEL SECURITY;

-- Org members can read disputes for their organization (e.g. owner resolves in SQL/dashboard later)
CREATE POLICY check_in_disputes_select ON check_in_disputes FOR SELECT
  USING (organization_id = auth_user_org_id());

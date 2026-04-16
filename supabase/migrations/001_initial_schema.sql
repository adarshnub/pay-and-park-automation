-- ============================================================
-- ParkEasy: Initial Schema Migration
-- Multi-lot parking management with ANPR/OCR
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PROFILES (linked to Supabase Auth users)
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'staff')),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PARKING LOTS
-- ============================================================
CREATE TABLE parking_lots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  total_capacity INTEGER NOT NULL DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PARKING ZONES (optional sub-areas)
-- ============================================================
CREATE TABLE parking_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parking_lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RATE PLANS
-- ============================================================
CREATE TABLE rate_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parking_lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Standard',
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 20.00,
  minimum_charge NUMERIC(10,2) NOT NULL DEFAULT 10.00,
  grace_period_minutes INTEGER NOT NULL DEFAULT 15,
  daily_cap NUMERIC(10,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- VEHICLES (plate registry)
-- ============================================================
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  normalized_plate TEXT NOT NULL,
  raw_plates TEXT[] NOT NULL DEFAULT '{}',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  visit_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (organization_id, normalized_plate)
);

-- ============================================================
-- VISITS (one row per parking session)
-- ============================================================
CREATE TABLE visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parking_lot_id UUID NOT NULL REFERENCES parking_lots(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  normalized_plate TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'checked_in' CHECK (status IN ('checked_in', 'checked_out', 'cancelled')),
  check_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_out_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  amount_charged NUMERIC(10,2),
  hourly_rate_snapshot NUMERIC(10,2),
  minimum_charge_snapshot NUMERIC(10,2),
  checked_in_by UUID REFERENCES profiles(id),
  checked_out_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate active visits for the same plate in an org
CREATE UNIQUE INDEX idx_visits_active_plate
  ON visits (organization_id, normalized_plate)
  WHERE status = 'checked_in';

-- ============================================================
-- VISIT IMAGES
-- ============================================================
CREATE TABLE visit_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  image_type TEXT NOT NULL CHECK (image_type IN ('check_in', 'check_out')),
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  ocr_job_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- OCR JOBS
-- ============================================================
CREATE TABLE ocr_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_image_id UUID NOT NULL REFERENCES visit_images(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  engine_used TEXT CHECK (engine_used IN ('free', 'openai')),
  raw_detected_plate TEXT,
  confidence NUMERIC(5,2),
  cropped_plate_path TEXT,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE visit_images
  ADD CONSTRAINT fk_visit_images_ocr_job
  FOREIGN KEY (ocr_job_id) REFERENCES ocr_jobs(id) ON DELETE SET NULL;

-- ============================================================
-- PLATE REVIEWS (audit every confirmation)
-- ============================================================
CREATE TABLE plate_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ocr_job_id UUID REFERENCES ocr_jobs(id) ON DELETE SET NULL,
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  raw_detected_plate TEXT,
  confirmed_plate TEXT NOT NULL,
  confirmed_by UUID NOT NULL REFERENCES profiles(id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  was_manually_edited BOOLEAN NOT NULL DEFAULT false,
  confidence NUMERIC(5,2)
);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL UNIQUE,
  amount NUMERIC(10,2) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  hourly_rate NUMERIC(10,2) NOT NULL,
  minimum_charge NUMERIC(10,2) NOT NULL,
  vehicle_plate TEXT NOT NULL,
  parking_lot_name TEXT NOT NULL,
  check_in_at TIMESTAMPTZ NOT NULL,
  check_out_at TIMESTAMPTZ NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false,
  payment_method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES for common queries
-- ============================================================
CREATE INDEX idx_visits_org ON visits(organization_id);
CREATE INDEX idx_visits_lot ON visits(parking_lot_id);
CREATE INDEX idx_visits_status ON visits(status);
CREATE INDEX idx_visits_check_in ON visits(check_in_at DESC);
CREATE INDEX idx_visits_plate ON visits(normalized_plate);
CREATE INDEX idx_vehicles_plate ON vehicles(organization_id, normalized_plate);
CREATE INDEX idx_ocr_jobs_status ON ocr_jobs(status);
CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_invoices_created ON invoices(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE plate_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Profiles: users see their own org members
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Organizations: users see their own org
CREATE POLICY orgs_select ON organizations FOR SELECT
  USING (id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY orgs_update ON organizations FOR UPDATE
  USING (id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'admin'));

-- Parking lots: scoped to org
CREATE POLICY lots_select ON parking_lots FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY lots_insert ON parking_lots FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'admin'));
CREATE POLICY lots_update ON parking_lots FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'admin'));

-- Parking zones: scoped via lot
CREATE POLICY zones_select ON parking_zones FOR SELECT
  USING (parking_lot_id IN (
    SELECT id FROM parking_lots WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  ));

-- Rate plans: scoped via lot
CREATE POLICY rates_select ON rate_plans FOR SELECT
  USING (parking_lot_id IN (
    SELECT id FROM parking_lots WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  ));
CREATE POLICY rates_manage ON rate_plans FOR ALL
  USING (parking_lot_id IN (
    SELECT id FROM parking_lots WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  ) AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'admin'));

-- Vehicles: scoped to org
CREATE POLICY vehicles_select ON vehicles FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY vehicles_insert ON vehicles FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY vehicles_update ON vehicles FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Visits: scoped to org
CREATE POLICY visits_select ON visits FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY visits_insert ON visits FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY visits_update ON visits FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Visit images: scoped via visit
CREATE POLICY images_select ON visit_images FOR SELECT
  USING (visit_id IN (
    SELECT id FROM visits WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  ) OR visit_id IS NULL);
CREATE POLICY images_insert ON visit_images FOR INSERT
  WITH CHECK (true);

-- OCR jobs: scoped via image -> visit
CREATE POLICY ocr_select ON ocr_jobs FOR SELECT
  USING (visit_image_id IN (SELECT id FROM visit_images));
CREATE POLICY ocr_insert ON ocr_jobs FOR INSERT
  WITH CHECK (true);
CREATE POLICY ocr_update ON ocr_jobs FOR UPDATE
  USING (true);

-- Plate reviews: scoped via visit
CREATE POLICY reviews_select ON plate_reviews FOR SELECT
  USING (visit_id IN (
    SELECT id FROM visits WHERE organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  ));
CREATE POLICY reviews_insert ON plate_reviews FOR INSERT
  WITH CHECK (true);

-- Invoices: scoped to org
CREATE POLICY invoices_select ON invoices FOR SELECT
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY invoices_insert ON invoices FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Auto-generate receipt numbers: ORG_PREFIX-YYYYMMDD-NNNN
CREATE OR REPLACE FUNCTION generate_receipt_number(org_id UUID)
RETURNS TEXT AS $$
DECLARE
  today_count INTEGER;
  prefix TEXT;
BEGIN
  SELECT COALESCE(LEFT(name, 3), 'PKE') INTO prefix FROM organizations WHERE id = org_id;
  SELECT COUNT(*) + 1 INTO today_count
    FROM invoices
    WHERE organization_id = org_id
      AND created_at::DATE = CURRENT_DATE;
  RETURN UPPER(prefix) || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(today_count::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_parking_lots_updated BEFORE UPDATE ON parking_lots FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rate_plans_updated BEFORE UPDATE ON rate_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_visits_updated BEFORE UPDATE ON visits FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ANALYTICS VIEWS
-- ============================================================

CREATE OR REPLACE VIEW daily_revenue AS
SELECT
  organization_id,
  parking_lot_id,
  DATE(check_out_at) AS revenue_date,
  COUNT(*) AS total_checkouts,
  SUM(amount_charged) AS total_revenue,
  AVG(duration_minutes) AS avg_duration_minutes
FROM visits
WHERE status = 'checked_out' AND amount_charged IS NOT NULL
GROUP BY organization_id, parking_lot_id, DATE(check_out_at);

CREATE OR REPLACE VIEW hourly_traffic AS
SELECT
  organization_id,
  parking_lot_id,
  DATE(check_in_at) AS traffic_date,
  EXTRACT(HOUR FROM check_in_at) AS hour_of_day,
  COUNT(*) FILTER (WHERE TRUE) AS entries,
  COUNT(*) FILTER (WHERE status = 'checked_out') AS exits
FROM visits
GROUP BY organization_id, parking_lot_id, DATE(check_in_at), EXTRACT(HOUR FROM check_in_at);

CREATE OR REPLACE VIEW lot_occupancy AS
SELECT
  pl.id AS parking_lot_id,
  pl.organization_id,
  pl.name AS lot_name,
  pl.total_capacity,
  COUNT(v.id) AS current_occupancy,
  pl.total_capacity - COUNT(v.id) AS available_spots,
  ROUND(COUNT(v.id)::NUMERIC / NULLIF(pl.total_capacity, 0) * 100, 1) AS utilization_pct
FROM parking_lots pl
LEFT JOIN visits v ON v.parking_lot_id = pl.id AND v.status = 'checked_in'
WHERE pl.is_active = true
GROUP BY pl.id, pl.organization_id, pl.name, pl.total_capacity;

-- ============================================================
-- STORAGE BUCKETS (run via Supabase dashboard or management API)
-- Bucket: vehicle-images (public read for signed URLs)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-images', 'vehicle-images', false);

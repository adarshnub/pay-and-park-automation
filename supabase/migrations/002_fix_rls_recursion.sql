-- ============================================================
-- Fix: infinite recursion in RLS policies
--
-- The profiles_select policy referenced profiles itself,
-- causing a circular dependency. This migration replaces all
-- policies with ones that use a SECURITY DEFINER helper
-- function to look up the user's organization_id without
-- triggering RLS.
-- ============================================================

-- Helper function: runs as definer (bypasses RLS) to get org_id
CREATE OR REPLACE FUNCTION auth_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Drop all existing policies
-- ============================================================
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_update_own ON profiles;
DROP POLICY IF EXISTS orgs_select ON organizations;
DROP POLICY IF EXISTS orgs_update ON organizations;
DROP POLICY IF EXISTS lots_select ON parking_lots;
DROP POLICY IF EXISTS lots_insert ON parking_lots;
DROP POLICY IF EXISTS lots_update ON parking_lots;
DROP POLICY IF EXISTS zones_select ON parking_zones;
DROP POLICY IF EXISTS rates_select ON rate_plans;
DROP POLICY IF EXISTS rates_manage ON rate_plans;
DROP POLICY IF EXISTS vehicles_select ON vehicles;
DROP POLICY IF EXISTS vehicles_insert ON vehicles;
DROP POLICY IF EXISTS vehicles_update ON vehicles;
DROP POLICY IF EXISTS visits_select ON visits;
DROP POLICY IF EXISTS visits_insert ON visits;
DROP POLICY IF EXISTS visits_update ON visits;
DROP POLICY IF EXISTS images_select ON visit_images;
DROP POLICY IF EXISTS images_insert ON visit_images;
DROP POLICY IF EXISTS ocr_select ON ocr_jobs;
DROP POLICY IF EXISTS ocr_insert ON ocr_jobs;
DROP POLICY IF EXISTS ocr_update ON ocr_jobs;
DROP POLICY IF EXISTS reviews_select ON plate_reviews;
DROP POLICY IF EXISTS reviews_insert ON plate_reviews;
DROP POLICY IF EXISTS invoices_select ON invoices;
DROP POLICY IF EXISTS invoices_insert ON invoices;

-- ============================================================
-- Recreate policies using the helper functions
-- ============================================================

-- Profiles
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (organization_id = auth_user_org_id() OR id = auth.uid());
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Organizations
CREATE POLICY orgs_select ON organizations FOR SELECT
  USING (id = auth_user_org_id());
CREATE POLICY orgs_update ON organizations FOR UPDATE
  USING (id = auth_user_org_id() AND auth_user_role() IN ('owner', 'admin'));

-- Parking lots
CREATE POLICY lots_select ON parking_lots FOR SELECT
  USING (organization_id = auth_user_org_id());
CREATE POLICY lots_insert ON parking_lots FOR INSERT
  WITH CHECK (organization_id = auth_user_org_id() AND auth_user_role() IN ('owner', 'admin'));
CREATE POLICY lots_update ON parking_lots FOR UPDATE
  USING (organization_id = auth_user_org_id() AND auth_user_role() IN ('owner', 'admin'));
CREATE POLICY lots_delete ON parking_lots FOR DELETE
  USING (organization_id = auth_user_org_id() AND auth_user_role() IN ('owner', 'admin'));

-- Parking zones
CREATE POLICY zones_select ON parking_zones FOR SELECT
  USING (parking_lot_id IN (SELECT id FROM parking_lots WHERE organization_id = auth_user_org_id()));

-- Rate plans
CREATE POLICY rates_select ON rate_plans FOR SELECT
  USING (parking_lot_id IN (SELECT id FROM parking_lots WHERE organization_id = auth_user_org_id()));
CREATE POLICY rates_insert ON rate_plans FOR INSERT
  WITH CHECK (parking_lot_id IN (SELECT id FROM parking_lots WHERE organization_id = auth_user_org_id()) AND auth_user_role() IN ('owner', 'admin'));
CREATE POLICY rates_update ON rate_plans FOR UPDATE
  USING (parking_lot_id IN (SELECT id FROM parking_lots WHERE organization_id = auth_user_org_id()) AND auth_user_role() IN ('owner', 'admin'));

-- Vehicles
CREATE POLICY vehicles_select ON vehicles FOR SELECT
  USING (organization_id = auth_user_org_id());
CREATE POLICY vehicles_insert ON vehicles FOR INSERT
  WITH CHECK (organization_id = auth_user_org_id());
CREATE POLICY vehicles_update ON vehicles FOR UPDATE
  USING (organization_id = auth_user_org_id());

-- Visits
CREATE POLICY visits_select ON visits FOR SELECT
  USING (organization_id = auth_user_org_id());
CREATE POLICY visits_insert ON visits FOR INSERT
  WITH CHECK (organization_id = auth_user_org_id());
CREATE POLICY visits_update ON visits FOR UPDATE
  USING (organization_id = auth_user_org_id());

-- Visit images
CREATE POLICY images_select ON visit_images FOR SELECT
  USING (true);
CREATE POLICY images_insert ON visit_images FOR INSERT
  WITH CHECK (true);

-- OCR jobs
CREATE POLICY ocr_select ON ocr_jobs FOR SELECT
  USING (true);
CREATE POLICY ocr_insert ON ocr_jobs FOR INSERT
  WITH CHECK (true);
CREATE POLICY ocr_update ON ocr_jobs FOR UPDATE
  USING (true);

-- Plate reviews
CREATE POLICY reviews_select ON plate_reviews FOR SELECT
  USING (visit_id IN (SELECT id FROM visits WHERE organization_id = auth_user_org_id()));
CREATE POLICY reviews_insert ON plate_reviews FOR INSERT
  WITH CHECK (true);

-- Invoices
CREATE POLICY invoices_select ON invoices FOR SELECT
  USING (organization_id = auth_user_org_id());
CREATE POLICY invoices_insert ON invoices FOR INSERT
  WITH CHECK (organization_id = auth_user_org_id());

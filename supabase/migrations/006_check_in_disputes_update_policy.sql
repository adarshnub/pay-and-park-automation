-- Allow org members to close disputes from the dashboard (resolve / dismiss).

CREATE POLICY check_in_disputes_update ON check_in_disputes FOR UPDATE
  USING (organization_id = auth_user_org_id())
  WITH CHECK (organization_id = auth_user_org_id());

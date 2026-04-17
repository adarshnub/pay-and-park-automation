-- Allow the same plate to be checked in at different parking lots within one org.
-- Uniqueness is now (organization, parking_lot, plate) while status = checked_in.

DROP INDEX IF EXISTS idx_visits_active_plate;

CREATE UNIQUE INDEX idx_visits_active_plate_per_lot
  ON visits (organization_id, parking_lot_id, normalized_plate)
  WHERE status = 'checked_in';

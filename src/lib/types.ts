export type VisitStatus = "checked_in" | "checked_out" | "cancelled";

export type OcrJobStatus = "pending" | "processing" | "completed" | "failed";

export type OcrEngine = "free" | "openai";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: "owner" | "admin" | "staff";
  organization_id: string;
  created_at: string;
}

export interface ParkingLot {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  total_capacity: number;
  is_active: boolean;
  created_at: string;
}

export interface RatePlan {
  id: string;
  parking_lot_id: string;
  name: string;
  hourly_rate: number;
  minimum_charge: number;
  grace_period_minutes: number;
  daily_cap: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Vehicle {
  id: string;
  organization_id: string;
  normalized_plate: string;
  raw_plates: string[];
  first_seen_at: string;
  visit_count: number;
}

export interface Visit {
  id: string;
  organization_id: string;
  parking_lot_id: string;
  vehicle_id: string | null;
  normalized_plate: string;
  status: VisitStatus;
  check_in_at: string;
  check_out_at: string | null;
  duration_minutes: number | null;
  amount_charged: number | null;
  hourly_rate_snapshot: number | null;
  minimum_charge_snapshot: number | null;
  created_at: string;
}

export interface VisitImage {
  id: string;
  visit_id: string | null;
  image_type: "check_in" | "check_out";
  storage_path: string;
  latitude: number | null;
  longitude: number | null;
  ocr_job_id: string | null;
  created_at: string;
}

export interface OcrJob {
  id: string;
  visit_image_id: string;
  status: OcrJobStatus;
  engine_used: OcrEngine | null;
  raw_detected_plate: string | null;
  confidence: number | null;
  cropped_plate_path: string | null;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface PlateReview {
  id: string;
  ocr_job_id: string | null;
  visit_id: string;
  raw_detected_plate: string | null;
  confirmed_plate: string;
  confirmed_by: string;
  confirmed_at: string;
  was_manually_edited: boolean;
  confidence: number | null;
}

export interface Invoice {
  id: string;
  visit_id: string;
  organization_id: string;
  receipt_number: string;
  amount: number;
  duration_minutes: number;
  hourly_rate: number;
  minimum_charge: number;
  vehicle_plate: string;
  parking_lot_name: string;
  check_in_at: string;
  check_out_at: string;
  paid: boolean;
  payment_method: string | null;
  created_at: string;
}

export interface DashboardStats {
  activeVehicles: number;
  totalCapacity: number;
  todayRevenue: number;
  todayEntries: number;
  todayExits: number;
  avgDurationMinutes: number;
}

export interface PlateReviewState {
  imageUrl: string | null;
  croppedPlateUrl: string | null;
  detectedPlate: string;
  confidence: number | null;
  engineUsed: OcrEngine | null;
  isLowConfidence: boolean;
  action: "check_in" | "check_out";
}

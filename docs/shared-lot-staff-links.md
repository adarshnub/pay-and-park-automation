# Shareable staff links (per parking lot)

## Setup

1. Run the SQL migrations for shared links and related behavior (see `supabase/migrations/003_lot_shared_links.sql`, `004_visits_active_plate_per_lot.sql`, `005_check_in_disputes.sql`, `006_check_in_disputes_update_policy.sql`).
2. In production, set **`NEXT_PUBLIC_SHAREABLE_LINK_BASE_URL`** to the exact origin you want in copied links (e.g. `https://your-custom-domain.com`), or set **`NEXT_PUBLIC_APP_URL`** for the same value if one URL is enough. These are not inferred from Vercel’s deployment hostname, so links stay on your public domain. Locally, if neither is set, the app uses the browser’s current origin when you create or rotate a link.
3. `SUPABASE_SERVICE_ROLE_KEY` must be set for server-side public APIs (already required for other features).

## Owner / admin

- **Settings → Parking lots**: each lot can list its staff links with **Copy link**. That generates a **new** secret URL, copies it, and invalidates the previous URL (confirm step).
- **Settings → Shareable staff links**: select a lot, **Create link**. The full URL is shown in the copyable panel; the secret is in the path (`/s/<token>`). Revoke disables a link without deleting history.

## Staff (mobile)

- Open the shared URL.
- Capture or upload a plate image → OCR fills the plate field (editable).
- **Look up vehicle**:
  - If there is an active visit **at that lot** for the plate → checkout preview and **Confirm check out**.
  - Otherwise → **Check in**.
- If the plate is already checked in **at another lot in the same organization**, check-in is blocked. The page explains which lot and offers **Submit dispute** (optional note). In the main app, open **Disputes** in the sidebar (`/disputes`) to list open items and **Resolve** (you addressed it) or **Leave as is** (close without changing visits).

## Security notes

- Links are **unauthenticated**; treat them like API keys. Revoke if leaked.
- Rate limiting is applied per IP + token hash (best-effort, per server instance).

## Manual QA checklist

1. Create link for lot A; open in private window; verify lot name and stats load.
2. Check in a new plate; confirm stats “Parked now” increases.
3. Same plate: lookup shows checkout preview; confirm checkout; stats and collections update.
4. Revoke link; same URL should return invalid / expired.

## API (for debugging)

- `POST /api/shared-lot/resolve` — `{ "token": "..." }`
- `POST /api/shared-lot/process-image` — `multipart/form-data`: `token`, `image`
- `POST /api/shared-lot/lookup` — `{ "token", "plate" }`
- `POST /api/shared-lot/check-in` — `{ "token", "plate", ... }` — on cross-lot conflict, response `409` may include `code: "CHECKED_IN_ELSEWHERE"`, `conflictingVisitId`, `otherParkingLotName`.
- `POST /api/shared-lot/dispute` — `{ "token", "plate", "conflictingVisitId", "note"?: string }`
- `POST /api/shared-lot/checkout-preview` — `{ "token", "plate" }`
- `POST /api/shared-lot/checkout-confirm` — `{ "token", "visitId", "plate", ... }`

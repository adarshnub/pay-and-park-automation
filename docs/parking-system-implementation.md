# ParkEasy - Parking Management System Implementation Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [System Flowchart](#system-flowchart)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Database Schema](#database-schema)
7. [OCR Pipeline](#ocr-pipeline)
8. [API usage for plate detection](#api-usage-for-plate-detection)
9. [Check-In / Check-Out Flows](#check-in--check-out-flows)
10. [Billing Logic](#billing-logic)
11. [Dashboard & Analytics](#dashboard--analytics)
12. [Authentication & Authorization](#authentication--authorization)
13. [Setup & Deployment](#setup--deployment)
14. [Environment Variables](#environment-variables)
15. [Operational Runbook](#operational-runbook)
16. [API Contracts](#api-contracts)

---

## Overview

ParkEasy is a production-grade, multi-lot parking management platform with automatic number plate recognition (ANPR). It enables parking operators to:

- **Check in vehicles** by photographing the front side with the number plate, or entering the plate manually.
- **Check out vehicles** by matching the plate to an active visit, calculating duration-based billing, and generating an invoice.
- **Track live occupancy** across multiple parking lots and branches.
- **Analyze operations** with dashboards covering revenue, traffic patterns, lot utilization, and OCR accuracy.

Every OCR result goes through a mandatory human review step before any database write. Staff always sees the captured image alongside an editable prefilled plate field and must confirm or correct it before the system creates a check-in or check-out.

---

## Architecture

```
                              +-------------------+
                              |    Next.js App     |
                              |   (App Router)     |
                              +--------+----------+
                                       |
                     +-----------------+------------------+
                     |                 |                  |
              Server Actions     API Routes        Static Pages
              (visits, settings)  (/api/ocr/*)     (dashboard, etc.)
                     |                 |
                     |                 |
              +------+------+    +-----+-------+
              |  Supabase   |    |  Supabase   |
              |  Postgres   |    |  Storage    |
              |  (RLS)      |    | (images)    |
              +------+------+    +-----+-------+
                     |                 |
                     +---------+-------+
                               |
                    +----------+----------+
                    |   ANPR Worker       |
                    |   (Python/EasyOCR)  |
                    |   Polls ocr_jobs    |
                    +---------------------+
                               |
                    (optional) OpenAI Vision fallback
```

### Key Design Decisions

1. **OCR runs outside the web request path.** The Python ANPR worker polls for pending OCR jobs independently, so image processing never blocks or slows down the Next.js app.

2. **Mandatory plate review before every DB write.** Whether OCR confidence is 95% or 30%, staff must confirm or edit the detected plate before a visit is created or closed.

3. **Multi-tenant with RLS.** Row-Level Security policies on every table ensure staff only see data from their assigned organization.

4. **Dual OCR strategy.** The free path (EasyOCR) is the primary engine. OpenAI Vision is an optional fallback triggered only when confidence is below threshold and an API key is configured.

---

## System Flowchart

```
┌──────────────────────┐
│ Staff uploads image   │
│ or types plate        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Upload image to       │
│ Supabase Storage      │
│ + Create OCR job      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ ANPR Worker picks     │
│ up pending job        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Detect plate region   │
│ (OpenCV contours)     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Run EasyOCR (free)    │
└──────────┬───────────┘
           │
     ┌─────┴──────┐
     │ Confidence  │
     │ high enough?│
     └─────┬──────┘
      Yes  │  No (+ OpenAI configured)
           │        │
           │        ▼
           │  ┌───────────────┐
           │  │ OpenAI Vision │
           │  │ fallback      │
           │  └───────┬───────┘
           │          │
           ▼          ▼
┌──────────────────────────┐
│ Normalize Indian plate    │
│ (regex + OCR corrections) │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ REVIEW SCREEN             │
│ - Show captured image     │
│ - Show cropped plate      │
│ - Editable prefilled      │
│   plate input             │
│ - Confidence badge        │
│ - Low-confidence warning  │
│ Staff must CONFIRM or     │
│ EDIT before proceeding    │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Active visit exists       │
│ for this plate?           │
└──────────┬───────────────┘
      No   │   Yes
           │     │
           ▼     ▼
   ┌───────┐ ┌──────────────┐
   │Check  │ │Close visit,  │
   │In     │ │calculate bill│
   │visit  │ │generate      │
   │       │ │invoice       │
   └───┬───┘ └──────┬───────┘
       │             │
       ▼             ▼
┌──────────────────────────┐
│ Update occupancy &        │
│ dashboard metrics         │
└──────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript | SSR/SSG pages, server actions |
| Styling | Tailwind CSS v4 | Utility-first CSS with CSS-based config |
| Charts | Recharts | Revenue, traffic, and occupancy charts |
| Forms | react-hook-form + Zod | Form state management and validation |
| Auth & DB | Supabase (Postgres + Auth + Storage) | Row-level security, file storage, email/password auth |
| Free OCR | EasyOCR + OpenCV | Number plate detection and text extraction |
| Paid OCR | OpenAI Vision (gpt-4o-mini) | Optional fallback for low-confidence detections |
| Worker | Python 3.12 | Background OCR job processing |
| Deployment | Vercel (Next.js) + Docker/VM (worker) | Separate deployment for web and worker |

---

## Project Structure

```
pay-and-park-automation/
├── app/
│   ├── globals.css              # Tailwind v4 theme
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Landing page
│   ├── (auth)/
│   │   ├── layout.tsx           # Centered auth layout
│   │   └── login/page.tsx       # Login form
│   ├── (dashboard)/
│   │   ├── layout.tsx           # Sidebar + main content
│   │   ├── dashboard/page.tsx   # Overview stats + recent activity
│   │   ├── check-in/page.tsx    # Vehicle check-in flow
│   │   ├── check-out/page.tsx   # Vehicle check-out + billing
│   │   ├── active-vehicles/page.tsx  # Live occupancy table
│   │   ├── visits/page.tsx      # All visits (paginated)
│   │   ├── billing/page.tsx     # Revenue summary + invoices
│   │   ├── analytics/page.tsx   # Charts and insights
│   │   └── settings/page.tsx    # Org, lots, rate plans
│   └── api/
│       └── ocr/process/route.ts # Inline OCR (OpenAI) + stub
├── src/
│   ├── lib/
│   │   ├── supabase/client.ts   # Browser Supabase client
│   │   ├── supabase/server.ts   # Server Supabase client
│   │   ├── supabase/middleware.ts # Auth session refresh
│   │   ├── plate.ts             # Indian plate normalization
│   │   ├── billing.ts           # Billing calculation
│   │   ├── types.ts             # TypeScript interfaces
│   │   └── utils.ts             # cn(), formatCurrency, formatDuration
│   ├── components/
│   │   ├── ui/                  # Button, Input, Card, Badge, etc.
│   │   ├── sidebar.tsx          # Dashboard navigation
│   │   ├── plate-review.tsx     # Mandatory plate confirmation
│   │   └── image-upload.tsx     # Camera + file upload with GPS
│   └── actions/
│       ├── visits.ts            # Check-in, lookup, check-out actions
│       └── settings.ts          # Org, lot, rate plan actions
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql  # Full schema + RLS + views
├── services/
│   └── anpr-worker/
│       ├── worker.py            # Job polling loop
│       ├── ocr_engine.py        # EasyOCR + plate detection
│       ├── plate_utils.py       # Python plate normalization
│       ├── config.py            # Environment config
│       ├── requirements.txt     # Python dependencies
│       └── Dockerfile           # Container build
├── middleware.ts                # Auth redirect middleware
├── docs/
│   └── parking-system-implementation.md  # This file
├── .env.example
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
└── package.json
```

---

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `organizations` | Parking operators / businesses |
| `profiles` | Staff accounts linked to Supabase Auth |
| `parking_lots` | Physical locations with capacity |
| `parking_zones` | Optional sub-areas within a lot |
| `rate_plans` | Hourly rate, minimum charge, grace period, daily cap |
| `vehicles` | Normalized plate registry with visit history |
| `visits` | One row per parking session (check-in to check-out) |
| `visit_images` | Photos with GPS and OCR job links |
| `ocr_jobs` | Async OCR processing queue |
| `plate_reviews` | Audit trail of every confirmation/edit |
| `invoices` | Billing records with receipt numbers |

### Key Constraints

- **Partial unique index** on `visits(organization_id, normalized_plate) WHERE status = 'checked_in'` prevents duplicate active visits.
- **Row-Level Security** on all tables scopes data to the user's organization.
- **Updated_at triggers** automatically maintain audit timestamps.

### Analytics Views

- `daily_revenue`: Revenue per lot per day.
- `hourly_traffic`: Entry/exit counts by hour.
- `lot_occupancy`: Current utilization percentage per lot.

---

## OCR Pipeline

### Free Path (Primary)

1. Image uploaded to `vehicle-images` bucket in Supabase Storage.
2. OCR job row created with status `pending`.
3. ANPR Worker (Python) polls for pending jobs every 3 seconds.
4. Worker downloads image, runs plate detection (OpenCV contour analysis), then EasyOCR.
5. OCR corrections applied (common misreads like O→0, I→1, S→5).
6. Result validated against Indian plate regex pattern.
7. Job updated to `completed` with confidence score.

### OpenAI Fallback (Optional)

1. If free OCR confidence is below threshold (default: 70%).
2. And `OPENAI_API_KEY` is configured.
3. Image sent to GPT-4o-mini Vision API with a specialized prompt.
4. Response parsed, corrected, and validated.
5. If OpenAI confidence is higher, its result replaces the free OCR result.

### Inline OCR (API Route)

For immediate feedback in the UI, **`POST /api/ocr/process`** and **`POST /api/shared-lot/process-image`** run the same server pipeline (`runServerOcrPipeline` in `src/lib/ocr/server-ocr-pipeline.ts`): optional EasyOCR service, then Gemini, then OpenAI, then Edge Tesseract, then local Tesseract (subject to Vercel flags). See [API usage for plate detection](#api-usage-for-plate-detection) for provider order, models, and cost notes.

The async worker still handles **queued** `ocr_jobs` for uploads that go through the worker path.

---

## API usage for plate detection

This section describes **which providers and models** are used for number-plate reads, **when** each runs, and how that relates to **cost and quotas**. Exact pricing changes over time; use each vendor’s current dashboard for billing.

### Two execution paths

| Path | Trigger | Code |
|------|---------|------|
| **Synchronous (Next.js)** | Dashboard check-in/out image helper or shared-lot photo flow | `POST /api/ocr/process`, `POST /api/shared-lot/process-image` → `runServerOcrPipeline` |
| **Asynchronous (Python worker)** | `ocr_jobs` row in `pending` state; worker polls Supabase | `services/anpr-worker/worker.py` + `ocr_engine.py` |

A single user upload in the dashboard or on `/s/...` normally hits **one** synchronous pipeline call per image. The worker path is separate (queue + poll interval).

### Synchronous pipeline (Next.js) — try order

The server tries sources **in order** until one returns a usable plate (or all fail). You are only charged by **cloud vendors** for steps that actually run and succeed (or sometimes for failed calls depending on provider); EasyOCR on your own host is **infra cost only**.

| Step | Provider | Model / runtime | Env vars | Notes |
|------|----------|-----------------|----------|-------|
| 1 | **EasyOCR HTTP service** (self-hosted) | EasyOCR `Reader(["en"])` + plate heuristics in `http_api.py` | `OCR_SERVICE_URL`, `OCR_SERVICE_SECRET` | Primary when configured. Default request timeout **20s** from Next.js. No Google/OpenAI tokens. |
| 2 | **Google Gemini** (Generative Language API) | Default **`gemini-2.0-flash`**; override with `GEMINI_MODEL` | `GEMINI_API_KEY`, optional `GEMINI_MODEL` | AI Studio keys start with **`AIza`**. Uses image + short JSON-style prompt; `temperature: 0`, `maxOutputTokens: 128`. Retries **429 / 5xx** a few times with backoff in `processWithGemini`. |
| 3 | **OpenAI** | **`gpt-4o-mini`** (vision) with **low** image detail on these routes | `OPENAI_API_KEY` | Charged per OpenAI vision + token rules. |
| 4 | **Supabase Edge + Tesseract.js** | Tesseract in Edge runtime | `SUPABASE_OCR_EDGE_URL`, `OCR_EDGE_SECRET`, plus Supabase anon/service key for gateway `Authorization` | Optional; **Deno may not support Tesseract’s worker path** — treat as experimental. |
| 5 | **Tesseract.js (Node)** | Local worker in Node | On Vercel: disabled unless `SHARED_LOT_ALLOW_SERVER_TESSERACT=true` (needs suitable `maxDuration`) | Heavy CPU; mainly for local/dev. |

**Preprocessing:** Images are often normalized with **Sharp** in Node (`preprocessImageForOcr`) before being sent to Gemini, OpenAI, or Edge.

### Asynchronous worker (Python) — try order

| Step | Provider | Model / runtime | Env vars | When |
|------|----------|-----------------|----------|------|
| 1 | **EasyOCR + OpenCV** | `Reader(["en"], gpu=False)` + contour pipeline | Same Supabase env as worker | Every `pending` job |
| 2 | **OpenAI** (optional) | **`gpt-4o-mini`** chat completions + vision content | `OPENAI_API_KEY` | When EasyOCR confidence is below `OCR_CONFIDENCE_THRESHOLD` (default **70**) and OpenAI returns higher confidence |

### How to minimize paid API usage

1. Run the **EasyOCR HTTP service** (`services/anpr-worker/http_api.py`) and set `OCR_SERVICE_URL` / `OCR_SERVICE_SECRET` so Next.js resolves plates without calling Gemini or OpenAI.
2. Keep the worker healthy for **async** jobs so fewer retries and manual corrections are needed.
3. Omit `GEMINI_API_KEY` / `OPENAI_API_KEY` in environments where manual plate entry is acceptable.

### Response field `engine`

Responses use a small set of values in `OcrRunResult`: **`free`** (EasyOCR HTTP service, or Tesseract-based reads in the pipeline), **`gemini`**, **`openai`**. The same `free` label is used for the Vercel “please type the plate” fallback when no provider returns text (`server-ocr-pipeline.ts`). It does **not** distinguish EasyOCR HTTP from Tesseract in JSON today; infer from logs or which env vars you configured.

---

## Check-In / Check-Out Flows

### Check-In

1. Staff selects parking lot from dropdown.
2. Captures vehicle image (camera/upload) or types plate manually.
3. Browser GPS coordinates are requested and attached if available.
4. Image goes through OCR (inline or async).
5. **Review screen** shows image + editable prefilled plate.
6. Staff confirms or corrects the plate.
7. Server action validates:
   - User is authenticated.
   - No existing active visit for this plate.
   - Upserts vehicle record.
   - Snapshots current rate plan.
   - Creates visit with status `checked_in`.
   - Records plate review for audit.

### Check-Out

1. Staff captures new image or types plate.
2. Same review screen flow.
3. After confirmation, server action:
   - Looks up active visit by normalized plate.
   - Fetches rate plan for the lot.
   - Calculates bill using `calculateBill()`.
   - Returns visit details + billing to the UI.
4. Staff reviews the amount and confirms check-out.
5. Server action:
   - Updates visit to `checked_out` with duration and amount.
   - Generates invoice with unique receipt number.
   - Records plate review.

---

## Billing Logic

```
finalAmount = max(minimumCharge, ceil(durationHours) * hourlyRate)

If dailyCap is set:
  finalAmount = min(finalAmount, dailyCap)

If duration <= gracePeriodMinutes:
  finalAmount = minimumCharge
```

### Configuration (per parking lot)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `hourly_rate` | 50 INR | Charge per hour (rounded up) |
| `minimum_charge` | 20 INR | Minimum amount per visit |
| `grace_period_minutes` | 15 min | Free parking window |
| `daily_cap` | null | Maximum charge per day (optional) |

### Examples

| Duration | Hourly Rate | Min Charge | Result |
|----------|------------|------------|--------|
| 10 min   | 50         | 20         | 20 (grace period, min applied) |
| 45 min   | 50         | 20         | 50 (1h rounded up) |
| 2h 15min | 50         | 20         | 150 (3h rounded up) |
| 30 min   | 30         | 20         | 30 (1h rounded up) |

---

## Dashboard & Analytics

### Dashboard (Overview)

- Active vehicles count
- Today's revenue
- Today's entries and exits
- Recent activity feed (last 10 visits)

### Active Vehicles

- Table of currently parked vehicles
- Search/filter by plate number
- Quick "Check Out" action button per vehicle
- Duration display (live)

### All Visits

- Paginated table with status badges
- Columns: Plate, Lot, Check In, Check Out, Duration, Amount, Status
- Color-coded: Active (blue), Completed (gray), Cancelled (red)

### Billing

- Revenue summary cards: Today / This Week / This Month
- Recent invoices table with paid/unpaid status
- Receipt numbers, amounts, durations

### Analytics

- **Revenue (30 days)**: Bar chart of daily revenue
- **Hourly Activity**: Entries and exits by hour for today
- **Occupancy Trend**: Line chart over last 7 days
- **Top Stats**: Total revenue, avg duration, busiest lot, OCR accuracy

### Settings

- Organization name
- Parking lots: list, add, remove
- Rate plans: hourly rate, minimum charge, grace period, daily cap (per lot)
- OpenAI API key: configured via environment variable

---

## Authentication & Authorization

### Supabase Auth

- Email/password login.
- Session managed via HTTP-only cookies through `@supabase/ssr`.
- Middleware refreshes session on every request and redirects unauthenticated users to `/login`.

### Roles

| Role | Permissions |
|------|-------------|
| `owner` | Full access: manage org, lots, rate plans, view all data |
| `admin` | Manage lots and rate plans, view all data |
| `staff` | Check-in, check-out, view active vehicles and visits |

### Row-Level Security

Every table has RLS policies that scope data to the user's `organization_id` derived from their profile. Staff cannot see or modify data from other organizations.

---

## Setup & Deployment

### Prerequisites

- Node.js 20+
- Python 3.12+ (for ANPR worker)
- Supabase project (free tier works)

### Quick Start

```bash
# 1. Clone and install
git clone https://github.com/adarshnub/pay-and-park-automation.git
cd pay-and-park-automation
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 3. Run the SQL migration
# Go to Supabase Dashboard > SQL Editor
# Paste and run: supabase/migrations/001_initial_schema.sql

# 4. Create storage bucket
# Supabase Dashboard > Storage > New bucket: "vehicle-images"

# 5. Create initial organization and user
# Supabase Dashboard > Authentication > Add user
# Then in SQL Editor:
#   INSERT INTO organizations (name, slug) VALUES ('My Parking', 'my-parking');
#   INSERT INTO profiles (id, email, full_name, role, organization_id)
#     VALUES ('<user-uuid>', 'you@example.com', 'Admin', 'owner', '<org-uuid>');

# 6. Start development server
npm run dev

# 7. (Optional) Start ANPR worker (uses root `.env.local` — same as step 2)
cd services/anpr-worker
pip install -r requirements.txt
python worker.py
```

### Production Deployment

**Next.js App** (Vercel recommended):
```bash
# Deploy to Vercel
vercel deploy --prod
# Set environment variables in Vercel dashboard
```

**ANPR Worker** (Docker):
```bash
cd services/anpr-worker
docker build -t anpr-worker .
docker run -d --env-file ../../.env.local anpr-worker
```

---

## Environment Variables

Use a **single** file at the repository root: **`.env.local`** (copy from `.env.example`). The Next.js app and the ANPR worker both read it (the worker searches upward from `services/anpr-worker` until it finds `.env.local` or `.env`).

### Shared (Next.js + ANPR worker)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (Next.js client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (Next.js server + worker) |
| `NEXT_PUBLIC_APP_URL` | No | Public app origin (optional; used for share links if `NEXT_PUBLIC_SHAREABLE_LINK_BASE_URL` is unset) |
| `NEXT_PUBLIC_SHAREABLE_LINK_BASE_URL` | No | Preferred origin for copied `/s/...` staff links (overrides `NEXT_PUBLIC_APP_URL` for links) |
| `OPENAI_API_KEY` | No | OpenAI Vision OCR (API routes + worker) |

The worker also accepts legacy names `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` if you prefer not to duplicate `NEXT_PUBLIC_*` / `SUPABASE_SERVICE_ROLE_KEY`.

### ANPR worker only

| Variable | Required | Description |
|----------|----------|-------------|
| `OCR_CONFIDENCE_THRESHOLD` | No | Default: 70 |
| `POLL_INTERVAL_SECONDS` | No | Default: 3 |

---

## Operational Runbook

### Common Tasks

**Add a new parking lot:**
Settings > Parking Lots > Add New Lot. A default rate plan is created automatically.

**Change pricing:**
Settings > Rate Plan > Select lot > Update rates > Save.

**Review failed OCR jobs:**
Check `ocr_jobs` table in Supabase where `status = 'failed'`. Common causes: corrupt images, unsupported formats, network timeouts.

**Monitor OCR accuracy:**
Analytics page shows OCR accuracy percentage. The `plate_reviews` table tracks `was_manually_edited` for every confirmation.

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "No parking lots available" | No lots created | Add lots in Settings |
| Check-in fails | Duplicate active visit | Check out the existing visit first |
| OCR returns empty plate | No API key, worker not running | Enter plate manually, or configure OpenAI/start worker |
| Images not uploading | Storage bucket missing | Create `vehicle-images` bucket in Supabase |
| 401 on dashboard | Session expired | Log in again |

---

## API Contracts

### POST `/api/ocr/process`

Process an image for plate detection.

**Request:** `multipart/form-data`
- `image` (File, required): Vehicle front-side image

**Response:**
```json
{
  "plate": "KA01AB1234",
  "confidence": 85,
  "engine": "openai",
  "croppedPlateUrl": null,
  "message": null
}
```

### Server Actions

**`checkInVehicle(input)`**
- Creates a visit with status `checked_in`.
- Returns `{ success, visitId, error }`.

**`lookupActiveVisit(plate)`**
- Finds matching active visit and calculates billing.
- Returns visit details with amount breakdown.

**`confirmCheckOut(visitId, input)`**
- Closes visit, generates invoice.
- Returns `{ success, invoiceId, receiptNumber, error }`.

**`updateRatePlan(input)`**
- Updates hourly rate, minimum charge, grace period, daily cap.
- Restricted to `owner` and `admin` roles.

---

*Generated for ParkEasy v1.0.0. Last updated: April 2026.*

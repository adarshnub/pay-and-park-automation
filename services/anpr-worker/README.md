# ANPR worker

Polls Supabase for OCR jobs and processes plate images.

## Configuration

Use the **repository root** `.env.local` (same file as the Next.js app). This package loads it by searching upward from `config.py` for `.env.local`, then `.env`.

Required (same names as Next.js):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Legacy names `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` still work if you set those instead.

Optional: `OPENAI_API_KEY`, `OCR_CONFIDENCE_THRESHOLD`, `POLL_INTERVAL_SECONDS`.

Do not rely on a separate `services/anpr-worker/.env` unless you also place `.env.local` there (not recommended).

## Run locally

From repo root:

```bash
cd services/anpr-worker
pip install -r requirements.txt
python worker.py
```

## Run as EasyOCR HTTP service

This mode is used by Next.js as primary OCR (`OCR_SERVICE_URL` + `OCR_SERVICE_SECRET`).

```bash
cd services/anpr-worker
pip install -r requirements.txt
export OCR_SERVICE_SECRET=replace-with-random-shared-secret
uvicorn http_api:app --host 0.0.0.0 --port 8000
```

Health check: `GET /health`  
OCR endpoint: `POST /ocr` with bearer token + JSON `{ "imageBase64": "..." }`

## Docker

Pass env from the monorepo root file, for example:

```bash
docker build -t anpr-worker .
docker run -d --env-file ../../.env.local anpr-worker
```

(Adjust the path to `.env.local` from your current directory.)

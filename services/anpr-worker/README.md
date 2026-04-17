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

## Docker

Pass env from the monorepo root file, for example:

```bash
docker build -t anpr-worker .
docker run -d --env-file ../../.env.local anpr-worker
```

(Adjust the path to `.env.local` from your current directory.)

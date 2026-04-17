"""Runtime config for ANPR worker.

Loads the same env file as the Next.js app: walk up from this package until a
`.env.local` or `.env` is found (typically the repository root). You can keep
one root `.env.local` for both apps.

Supabase variables align with Next.js when possible:
- `NEXT_PUBLIC_SUPABASE_URL` (or legacy `SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (or legacy `SUPABASE_SERVICE_KEY`)
"""

import os
from pathlib import Path

from dotenv import load_dotenv


def _load_monorepo_env() -> None:
    """Prefer repo root (directory with package.json) so a stray services/anpr-worker/.env
    does not shadow the shared root `.env.local`.
    """
    here = Path(__file__).resolve().parent
    for directory in (here, *here.parents):
        if directory == directory.parent:
            break
        if (directory / "package.json").is_file():
            for filename in (".env.local", ".env"):
                candidate = directory / filename
                if candidate.is_file():
                    load_dotenv(candidate)
                    return
            load_dotenv()
            return

    # Docker / flat layout: walk up for .env.local then .env (e.g. mounted at /app)
    for directory in (here, *here.parents):
        if directory == directory.parent:
            break
        for filename in (".env.local", ".env"):
            candidate = directory / filename
            if candidate.is_file():
                load_dotenv(candidate)
                return
    load_dotenv()


_load_monorepo_env()

SUPABASE_URL = (
    os.getenv("SUPABASE_URL", "").strip()
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
)
SUPABASE_SERVICE_KEY = (
    os.getenv("SUPABASE_SERVICE_KEY", "").strip()
    or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OCR_CONFIDENCE_THRESHOLD = int(os.getenv("OCR_CONFIDENCE_THRESHOLD", "70"))
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "3"))
STORAGE_BUCKET = "vehicle-images"

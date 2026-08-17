"""Vercel Python Functions entrypoint.

Vercel builds each file under /api into a serverless function. This file
just points at the real FastAPI app, which lives in /backend/app as a
normal importable package — sys.path is extended so `import app...` resolves
exactly like it does when running `uvicorn app.main:app` from inside
/backend during local development. No code is duplicated or forked here.
"""

import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.main import app  # noqa: E402

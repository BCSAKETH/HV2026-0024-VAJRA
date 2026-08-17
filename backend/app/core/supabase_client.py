from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from app.core.config import get_settings


def fetch_one(query: Any) -> dict | None:
    """Wraps a `.maybe_single()` builder's `.execute()` call. This installed
    version of postgrest-py returns a bare `None` (not a response object)
    when zero rows match, rather than an object with `.data = None` — so
    `result.data` blows up on every legitimate "not found" case unless it's
    normalized here first. Always go through this for `.maybe_single()`,
    never touch `.execute()` on it directly."""
    result = query.execute()
    return result.data if result is not None else None


@lru_cache
def get_admin_client() -> Client:
    """Service-role client. Bypasses RLS. This is what almost every route uses —
    FastAPI is the trusted layer that enforces authorization in Python; RLS in
    Postgres is defense-in-depth, not the primary gate."""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


@lru_cache
def get_anon_client() -> Client:
    """Anon-key client, used only for the real (non-bypass) phone OTP
    send/verify calls against Supabase Auth's public API."""
    settings = get_settings()
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

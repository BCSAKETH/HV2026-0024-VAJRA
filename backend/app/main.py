import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import admin, analytics, auth, consolidation, driver_link, hubs, lastmile, linehaul, ocr, printer, resolve, shipments, track

logger = logging.getLogger("locus.main")

app = FastAPI(
    title="LOCUS API",
    description="The Exact Point of Truth — QR-based product tracking, inventory movement & supply chain traceability.",
    version="0.1.0",
)

# get_settings() validates required env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# SUPABASE_ANON_KEY, APP_JWT_SECRET) and raises if any are missing. That's the
# right behavior for routes that actually need them — but this used to run
# unguarded at module import time, so a single missing env var on a fresh
# deployment took down *every* route, including /api/health, as an opaque
# Vercel FUNCTION_INVOCATION_FAILED with no indication of why. Now the import
# itself can never crash the app; /api/health reports the real problem instead.
_settings_error: str | None = None
try:
    _settings = get_settings()
    cors_origins = _settings.cors_origin_list
except Exception as exc:  # noqa: BLE001 - deliberately broad: config errors must never crash the import
    logger.exception("Settings failed to load — check environment variables")
    _settings_error = str(exc)
    cors_origins = ["*"]  # permissive fallback so the app is still reachable to diagnose itself

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Everything the backend serves lives under /api — this disambiguates it from
# the Next.js app's own page routes when both are deployed under one Vercel
# domain (e.g. the public /track/[id] *page* in web vs. the /track/{id} data
# *endpoint* here would otherwise collide on the same path).
api = APIRouter(prefix="/api")
api.include_router(auth.router)
api.include_router(printer.router)
api.include_router(ocr.router)
api.include_router(shipments.router)
api.include_router(consolidation.router)
api.include_router(resolve.router)
api.include_router(hubs.router)
api.include_router(linehaul.router)
api.include_router(linehaul.sync_router)
api.include_router(lastmile.router)
api.include_router(admin.router)
api.include_router(track.router)
api.include_router(driver_link.router)
api.include_router(driver_link.notifications_router)
api.include_router(analytics.router)
app.include_router(api)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    if _settings_error:
        return {
            "status": "misconfigured",
            "service": "locus-api",
            "error": "Required environment variables are missing or invalid — every other route will fail until this is fixed.",
            "detail": _settings_error,
        }
    return {"status": "ok", "service": "locus-api"}

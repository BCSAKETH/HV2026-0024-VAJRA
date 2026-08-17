from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import admin, auth, consolidation, hubs, lastmile, linehaul, ocr, printer, resolve, shipments, track

settings = get_settings()

app = FastAPI(
    title="LOCUS API",
    description="The Exact Point of Truth — QR-based product tracking, inventory movement & supply chain traceability.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
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
app.include_router(api)


@app.get("/api/health", tags=["health"])
def health() -> dict:
    return {"status": "ok", "service": "locus-api"}

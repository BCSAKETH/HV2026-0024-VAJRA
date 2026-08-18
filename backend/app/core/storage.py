import logging
import uuid

from app.core.supabase_client import get_admin_client

log = logging.getLogger("locus.storage")
BUCKET = "package_conditions"


def ensure_bucket_exists():
    """Ensures the package_conditions storage bucket exists in Supabase Storage.
    Creates it dynamically if not present."""
    admin = get_admin_client()
    try:
        buckets = admin.storage.list_buckets()
        bucket_names = [b.name for b in buckets] if buckets else []
        if BUCKET not in bucket_names:
            admin.storage.create_bucket(BUCKET, options={"public": True})
            log.info("Created public Supabase storage bucket: %s", BUCKET)
    except Exception as exc:
        log.warning("Storage bucket check/create attempt for %s: %s", BUCKET, exc)


def upload_condition_photo(tracking_id: str, content: bytes, content_type: str = "image/jpeg") -> str:
    """Uploads one condition photo and returns its public URL. Mobile never
    talks to Supabase Storage directly — it posts bytes to FastAPI, which
    holds the service-role key, exactly like every other write in this app."""
    admin = get_admin_client()
    ext = "jpg" if "jpeg" in content_type or "jpg" in content_type else content_type.split("/")[-1]
    path = f"{tracking_id}/{uuid.uuid4().hex}.{ext}"

    try:
        admin.storage.from_(BUCKET).upload(path, content, {"content-type": content_type})
    except Exception as exc:
        log.warning("Initial upload failed (%s), ensuring bucket exists and retrying...", exc)
        ensure_bucket_exists()
        admin.storage.from_(BUCKET).upload(path, content, {"content-type": content_type})

    return admin.storage.from_(BUCKET).get_public_url(path)


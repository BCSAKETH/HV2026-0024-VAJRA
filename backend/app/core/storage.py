import uuid

from app.core.supabase_client import get_admin_client

BUCKET = "package_conditions"


def upload_condition_photo(tracking_id: str, content: bytes, content_type: str = "image/jpeg") -> str:
    """Uploads one condition photo and returns its public URL. Mobile never
    talks to Supabase Storage directly — it posts bytes to FastAPI, which
    holds the service-role key, exactly like every other write in this app."""
    admin = get_admin_client()
    ext = "jpg" if "jpeg" in content_type or "jpg" in content_type else content_type.split("/")[-1]
    path = f"{tracking_id}/{uuid.uuid4().hex}.{ext}"

    admin.storage.from_(BUCKET).upload(path, content, {"content-type": content_type})
    return admin.storage.from_(BUCKET).get_public_url(path)

from fastapi import HTTPException, status

from app.core.supabase_client import fetch_one
from app.models.phase2 import BagOut


def get_bag_or_404(admin, bag_id: str) -> dict:
    result = fetch_one(admin.table("master_bags").select("*").eq("bag_id", bag_id).maybe_single())
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown bag_id")
    return result


def child_count(admin, bag_id: str) -> int:
    result = admin.table("shipments").select("tracking_id", count="exact").eq("current_bag_id", bag_id).execute()
    return result.count or 0


def bag_out(admin, bag_row: dict) -> BagOut:
    return BagOut(child_count=child_count(admin, bag_row["bag_id"]), **bag_row)

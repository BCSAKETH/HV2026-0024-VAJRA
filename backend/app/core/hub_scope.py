from fastapi import HTTPException, status

AVG_TRUCK_SPEED_KMH = 40.0  # documented assumption — we have no real road-network/traffic data
DELAY_THRESHOLD_MULTIPLIER = 1.5


def resolve_scope_hub_id(staff: dict, preview_hub_id: str | None) -> str | None:
    """Returns the hub_id a dashboard request should be scoped to, or None
    for the full network. Hub Managers are hard-locked to their own hub —
    `preview_hub_id` is a Super-Admin-only "view as" feature for demoing the
    Hub Manager screen, never an escalation path for a real Hub Manager."""
    role = staff["role"]

    if role == "HUB_MANAGER":
        return staff["assigned_hub_id"]

    if role == "SUPER_ADMIN":
        return preview_hub_id  # None => full network

    if preview_hub_id is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Super Admin can preview another hub's view")
    return staff.get("assigned_hub_id")

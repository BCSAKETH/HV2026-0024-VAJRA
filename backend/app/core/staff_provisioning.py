"""Shared Supabase Auth user provisioning for staff accounts — used by both
seed.py and the staff-management admin endpoints so there's one place that
knows how a staff.id (UUID) gets minted."""


def get_or_create_auth_user(admin, phone: str) -> str:
    try:
        created = admin.auth.admin.create_user({"phone": phone, "phone_confirm": True})
        return created.user.id
    except Exception:
        # Most likely an auth user for this phone already exists (e.g. a
        # staff row was deleted without cleaning up auth.users) — reuse it
        # rather than fail the whole creation.
        page = admin.auth.admin.list_users()
        for user in page:
            if getattr(user, "phone", None) == phone.lstrip("+"):
                return user.id
        raise


def delete_auth_user(admin, staff_id: str) -> None:
    try:
        admin.auth.admin.delete_user(staff_id)
    except Exception:
        pass  # best-effort — the staff row deletion is what actually revokes access

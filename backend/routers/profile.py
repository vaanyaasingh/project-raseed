"""Profile router — GET and PUT /api/v1/profile."""

from fastapi import APIRouter, Depends
from middleware.auth import get_current_user
from db.database import db_conn
from models.schemas import ProfileUpdateRequest

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])


@router.get("")
async def get_profile(current_user: dict = Depends(get_current_user)) -> dict:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT name, phone, business_name, gstin, updated_at FROM user_profiles WHERE user_id = ?",
            (current_user["id"],),
        ).fetchone()

    base = {
        "user_id": current_user["id"],
        "email": current_user["email"],
        "name": None,
        "phone": None,
        "business_name": None,
        "gstin": None,
        "updated_at": None,
    }
    if row:
        base.update(dict(row))
    return base


@router.put("")
async def update_profile(
    body: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    with db_conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO user_profiles
               (user_id, name, phone, business_name, gstin, updated_at)
               VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            (
                current_user["id"],
                body.name,
                body.phone,
                body.business_name,
                body.gstin,
            ),
        )
    return {"ok": True}

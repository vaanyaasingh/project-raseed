"""Users router — profile CRUD + letterhead upload."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from middleware.auth import get_current_user
from db.supabase_client import supabase
from models.schemas import ErrorResponse, ProfileUpdateRequest

router = APIRouter(prefix="/api/v1/users", tags=["users"])

_BUCKET = "raseed-uploads"
_ALLOWED_LH_EXTS = {"png", "jpg", "jpeg", "pdf"}
_MAX_LH_BYTES = 5 * 1024 * 1024  # 5 MB


# ── GET /api/v1/users/profile ─────────────────────────────────────────────────

@router.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)) -> dict:
    response = (
        supabase.table("users")
        .select("*")
        .eq("id", current_user["id"])
        .maybe_single()
        .execute()
    )
    base = {
        "id": current_user["id"],
        "email": current_user["email"],
        "name": None,
        "phone": None,
        "business_name": None,
        "gstin": None,
        "letterhead_path": None,
    }
    if response and response.data:
        base.update(response.data)
    return base


# ── POST /api/v1/users/profile ────────────────────────────────────────────────

@router.post("/profile")
async def upsert_profile(
    body: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    supabase.table("users").upsert({
        "id": current_user["id"],
        "email": current_user["email"],
        "name": body.name,
        "phone": body.phone,
        "business_name": body.business_name,
        "gstin": body.gstin,
        "updated_at": "now()",
    }).execute()
    return {"ok": True}


# ── POST /api/v1/users/letterhead ─────────────────────────────────────────────

@router.post("/letterhead")
async def upload_letterhead(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Upload a company letterhead (PNG, JPG, or PDF).  Stored in Supabase Storage."""
    filename = file.filename or "letterhead"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in _ALLOWED_LH_EXTS:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="INVALID_FILE_TYPE",
                message="Letterhead must be PNG, JPG, or PDF.",
            ).model_dump(),
        )

    contents = await file.read()
    if len(contents) > _MAX_LH_BYTES:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="FILE_TOO_LARGE",
                message="Letterhead must be under 5 MB.",
            ).model_dump(),
        )

    user_id = current_user["id"]
    path = f"{user_id}/letterhead/letterhead.{ext}"
    content_type = "application/pdf" if ext == "pdf" else f"image/{ext}"

    # Remove old letterhead if exists
    try:
        supabase.storage.from_(_BUCKET).remove([path])
    except Exception:
        pass

    supabase.storage.from_(_BUCKET).upload(
        path=path,
        file=contents,
        file_options={"content-type": content_type, "upsert": "true"},
    )

    # Save path in users table
    supabase.table("users").upsert({
        "id": user_id,
        "email": current_user["email"],
        "letterhead_path": path,
        "updated_at": "now()",
    }).execute()

    return {"ok": True, "letterhead_path": path, "ext": ext}


# ── DELETE /api/v1/users/letterhead ──────────────────────────────────────────

@router.delete("/letterhead")
async def delete_letterhead(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Remove the stored letterhead."""
    user_id = current_user["id"]

    # Get current path
    row = supabase.table("users").select("letterhead_path").eq("id", user_id).maybe_single().execute()
    path = (row.data or {}).get("letterhead_path") if row else None

    if path:
        try:
            supabase.storage.from_(_BUCKET).remove([path])
        except Exception:
            pass

    supabase.table("users").update({"letterhead_path": None}).eq("id", user_id).execute()
    return {"ok": True}

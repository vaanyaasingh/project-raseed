"""Auth router — one-click sign-in for the demo account."""

import os

from fastapi import APIRouter, HTTPException

from db.supabase_client import supabase

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

DEMO_ACCOUNT_EMAIL = os.environ.get("DEMO_ACCOUNT_EMAIL")
ENABLE_DEMO_LOGIN = os.environ.get("ENABLE_DEMO_LOGIN", "false").lower() == "true"


# ── POST /api/v1/auth/demo-login ───────────────────────────────────────────────

@router.post("/demo-login")
async def demo_login() -> dict:
    """Mint a magic-link token for the fixed demo account.

    The email always comes from DEMO_ACCOUNT_EMAIL, never from the caller —
    otherwise this endpoint would let anyone generate a login link for any
    address in the project.

    Disabled by default — must be explicitly turned on with ENABLE_DEMO_LOGIN=true
    (e.g. for a staging/showcase deploy), since it mints a real session with no
    auth check.
    """
    if not ENABLE_DEMO_LOGIN:
        raise HTTPException(status_code=404, detail="Not found.")
    if not DEMO_ACCOUNT_EMAIL:
        raise HTTPException(status_code=503, detail="Demo account is not configured.")

    try:
        result = supabase.auth.admin.generate_link({
            "type": "magiclink",
            "email": DEMO_ACCOUNT_EMAIL,
        })
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to create demo session: {exc}")

    return {
        "email": DEMO_ACCOUNT_EMAIL,
        "token_hash": result.properties.hashed_token,
    }

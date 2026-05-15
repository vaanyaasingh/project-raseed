"""Chats router — CRUD for saved chat conversations."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from middleware.auth import get_current_user
from db.supabase_client import supabase
from models.schemas import ErrorResponse

router = APIRouter(prefix="/api/v1/chats", tags=["chats"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class SavedMessage(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class UpsertChatRequest(BaseModel):
    id: str
    topic: str
    title: str
    messages: list[SavedMessage]


# ── GET /api/v1/chats ─────────────────────────────────────────────────────────

@router.get("")
async def list_chats(
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return metadata list of the user's saved chats (no full messages)."""
    response = (
        supabase.table("chats")
        .select("id, topic, title, updated_at, created_at")
        .eq("user_id", current_user["id"])
        .order("updated_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"chats": response.data or []}


# ── GET /api/v1/chats/{chat_id} ───────────────────────────────────────────────

@router.get("/{chat_id}")
async def get_chat(
    chat_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return a single chat with full messages."""
    row = (
        supabase.table("chats")
        .select("*")
        .eq("id", chat_id)
        .eq("user_id", current_user["id"])
        .maybe_single()
        .execute()
    )
    if not row or not row.data:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(code="CHAT_NOT_FOUND", message="Chat not found.").model_dump(),
        )
    return row.data


# ── PUT /api/v1/chats/{chat_id} ───────────────────────────────────────────────

@router.put("/{chat_id}")
async def upsert_chat(
    chat_id: str,
    body: UpsertChatRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create or update a chat (upsert by id)."""
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("chats").upsert({
        "id": chat_id,
        "user_id": current_user["id"],
        "topic": body.topic,
        "title": body.title[:120],          # cap title length
        "messages": [m.model_dump() for m in body.messages],
        "updated_at": now,
    }).execute()
    return {"ok": True, "id": chat_id}


# ── DELETE /api/v1/chats/{chat_id} ────────────────────────────────────────────

@router.delete("/{chat_id}")
async def delete_chat(
    chat_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Delete a saved chat."""
    supabase.table("chats").delete().eq("id", chat_id).eq("user_id", current_user["id"]).execute()
    return {"ok": True}

"""Chatbot router — streaming Gemini chat across four topic domains."""

import os
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from middleware.auth import get_current_user
from db.supabase_client import supabase
from google import genai
from google.genai import types

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

_MODEL = "gemini-2.5-flash"
_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set in environment")
        _client = genai.Client(api_key=api_key)
    return _client


# ── Request schema ─────────────────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    topic: Literal["compliance", "invoice", "finance", "misc"]
    history: list[HistoryMessage] = []


# ── System prompts ────────────────────────────────────────────────────────────

_SYSTEM_PROMPTS: dict[str, str] = {
    "compliance": (
        "You are a GST and tax compliance expert for Indian SMEs. "
        "{context}"
        "Help users understand GST notices, filing deadlines (GSTR-1, GSTR-3B, annual return, etc.), "
        "input tax credit (ITC) rules, penalties, and compliance requirements under the CGST/IGST Act. "
        "Be specific, practical, and cite relevant sections when useful. "
        "Keep answers concise and actionable. Format lists with dashes."
    ),
    "invoice": (
        "You are an invoice and billing expert for Indian GST law. "
        "{context}"
        "Help users with GST-compliant invoice requirements, HSN/SAC codes, applicable tax rates, "
        "input tax credit eligibility, e-invoicing mandates, credit/debit notes, and billing best practices. "
        "Keep answers concise and actionable. Format lists with dashes."
    ),
    "finance": (
        "You are a financial analysis expert for Indian SMEs. "
        "{context}"
        "Help users understand their cash flow, bank statement patterns, financial health indicators, "
        "working capital management, and provide actionable insights to improve business finances. "
        "Keep answers concise and practical. Format lists with dashes."
    ),
    "misc": (
        "You are Raseed, an AI-powered compliance and finance copilot for Indian SMEs. "
        "{context}"
        "Help users with any questions about GST, invoices, compliance, finance, or general "
        "business advice relevant to Indian small businesses. "
        "Be friendly, concise, and practical. Format lists with dashes."
    ),
}


# ── POST /api/v1/chat ──────────────────────────────────────────────────────────

@router.post("")
async def chat(
    body: ChatRequest,
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """
    Stream a Gemini response for a chat message.
    Fetches user profile to personalise the system prompt.
    Returns a text/plain StreamingResponse.
    """
    # ── Fetch user profile for context ────────────────────────────────────────
    profile_row = (
        supabase.table("users")
        .select("business_name, gstin")
        .eq("id", current_user["id"])
        .maybe_single()
        .execute()
    )
    profile = profile_row.data if (profile_row and profile_row.data) else {}
    business_name = profile.get("business_name") or "your business"
    gstin = profile.get("gstin") or "not provided"

    context = f"The user's business is '{business_name}' (GSTIN: {gstin}). "
    system_prompt = _SYSTEM_PROMPTS[body.topic].format(context=context)

    # ── Build conversation history (max 10 exchanges = 20 messages) ───────────
    history = body.history[-20:]
    contents: list[types.Content] = []
    for msg in history:
        role = "model" if msg.role == "assistant" else "user"
        contents.append(
            types.Content(role=role, parts=[types.Part(text=msg.content)])
        )
    # Append the new user message
    contents.append(
        types.Content(role="user", parts=[types.Part(text=body.message)])
    )

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        max_output_tokens=1024,
    )

    client = _get_client()

    # ── Sync generator — Starlette iterates it via run_in_threadpool ──────────
    def _stream():
        try:
            for chunk in client.models.generate_content_stream(
                model=_MODEL,
                contents=contents,
                config=config,
            ):
                if chunk.text:
                    yield chunk.text
        except Exception as exc:
            # Surface errors as a plain-text sentinel so the frontend can handle them
            yield f"\n\n[Error: {exc}]"

    return StreamingResponse(_stream(), media_type="text/plain")

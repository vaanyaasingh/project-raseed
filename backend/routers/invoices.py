"""Invoices router — extraction, generation, send confirmation, listing, and PDF download."""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from agents.communication_agent import draft_email, send_email
from middleware.auth import get_current_user
from agents.invoice_agent import extract, generate
from db.supabase_client import supabase
from models.schemas import (
    ErrorResponse,
    InvoiceExtractRequest,
    InvoiceGenerateRequest,
    InvoiceSendRequest,
)

router = APIRouter(prefix="/api/v1/invoices", tags=["invoices"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fetch_upload(upload_id: str, user_id: str) -> dict:
    """Fetch an upload row from Supabase, scoped to the current user."""
    response = (
        supabase.table("uploads")
        .select("id, filename, file_type, analysis_status")
        .eq("id", upload_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not response or not response.data:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                code="UPLOAD_NOT_FOUND",
                message=f"No upload found for id={upload_id}",
            ).model_dump(),
        )
    return response.data


def _fetch_cached_analysis(upload_id: str, user_id: str) -> dict | None:
    """Return the cached analysis result for an upload, or None if not ready."""
    response = (
        supabase.table("analyses")
        .select("result_json, todo_items")
        .eq("upload_id", upload_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    return response.data if response.data else None


def _fetch_invoice(invoice_id: str, user_id: str) -> dict:
    """Fetch an invoice from Supabase scoped to the current user."""
    response = (
        supabase.table("invoices")
        .select("*")
        .eq("id", invoice_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not response or not response.data:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                code="INVOICE_NOT_FOUND",
                message=f"No invoice found for id={invoice_id}",
            ).model_dump(),
        )
    return response.data


def _save_invoice(
    invoice_id: str,
    parsed: dict,
    upload_id: str | None = None,
    user_id: str | None = None,
) -> None:
    """Upsert an invoice row in Supabase."""
    row = {
        "id": invoice_id,
        "invoice_number": parsed.get("invoice_number"),
        "invoice_date": parsed.get("invoice_date"),
        "vendor_name": parsed.get("vendor_name"),
        "vendor_gstin": parsed.get("vendor_gstin"),
        "buyer_name": parsed.get("buyer_name"),
        "buyer_gstin": parsed.get("buyer_gstin"),
        "grand_total": parsed.get("grand_total"),
        "total_gst": parsed.get("total_gst"),
        "invoice_type": parsed.get("invoice_type"),
        "raw_json": parsed,
        "upload_id": upload_id,
        "user_id": user_id,
    }
    try:
        supabase.table("invoices").upsert(row).execute()
    except Exception:
        pass  # non-fatal; agent result is already returned to caller


# ── POST /api/v1/invoices/extract ─────────────────────────────────────────────

@router.post("/extract")
async def extract_invoice(
    body: InvoiceExtractRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    Return structured invoice fields for a previously uploaded invoice PDF.
    Analysis runs inline at upload time and is cached in the `analyses` table —
    this endpoint returns the cached result (no Gemini call).
    """
    upload = _fetch_upload(body.upload_id, current_user["id"])

    if upload["file_type"] != "invoice":
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="WRONG_DOC_TYPE",
                message=f"Expected file_type='invoice', got '{upload['file_type']}'.",
            ).model_dump(),
        )

    if upload["analysis_status"] != "complete":
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="ANALYSIS_PENDING",
                message="Analysis is not complete yet. Upload the document first via /api/v1/upload/document.",
            ).model_dump(),
        )

    cached = _fetch_cached_analysis(body.upload_id, current_user["id"])
    if not cached:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                code="ANALYSIS_NOT_FOUND",
                message="No analysis found. Re-upload the invoice PDF.",
            ).model_dump(),
        )

    result_json = cached["result_json"]
    # Pull structured data from the first agent response
    responses = result_json.get("responses", [])
    structured_data = responses[0]["structured_data"] if responses else {}
    summary = responses[0]["summary"] if responses else ""
    confidence = responses[0]["confidence"] if responses else 0.9

    # Ensure the invoice row exists in Supabase for send/list
    invoice_id = structured_data.get("invoice_id", str(uuid.uuid4()))
    parsed = {k: v for k, v in structured_data.items() if k != "invoice_id"}
    _save_invoice(invoice_id, parsed, upload_id=body.upload_id, user_id=current_user["id"])

    return {
        "invoice_id": invoice_id,
        "upload_id": body.upload_id,
        "summary": summary,
        "confidence": confidence,
        **structured_data,
    }


# ── POST /api/v1/invoices/generate ────────────────────────────────────────────

@router.post("/generate")
async def generate_invoice(
    body: InvoiceGenerateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Generate a GST-compliant invoice from user-supplied details."""
    result = generate(body)

    if result.confidence == 0.0:
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                code="AGENT_ERROR",
                message=result.summary,
            ).model_dump(),
        )

    invoice_id = result.structured_data.get("invoice_id", str(uuid.uuid4()))
    parsed = {k: v for k, v in result.structured_data.items() if k != "invoice_id"}
    _save_invoice(invoice_id, parsed, user_id=current_user["id"])

    return {
        "invoice_id": invoice_id,
        "summary":    result.summary,
        "confidence": result.confidence,
        **result.structured_data,
    }


# ── POST /api/v1/invoices/send ────────────────────────────────────────────────

@router.post("/send")
async def send_invoice(
    body: InvoiceSendRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    Human-in-the-loop send: called after the user confirms the draft in the
    frontend modal. Drafts the email via communication agent, sends it via SMTP,
    then stamps sent_at in Supabase.
    """
    invoice = _fetch_invoice(body.invoice_id, current_user["id"])

    raw_json = invoice.get("raw_json") or {}
    if isinstance(raw_json, str):
        try:
            invoice_data = json.loads(raw_json)
        except json.JSONDecodeError:
            invoice_data = {}
    else:
        invoice_data = raw_json  # already a dict (Supabase JSONB)

    context = {
        "invoice_number": invoice.get("invoice_number"),
        "vendor_name":    invoice.get("vendor_name"),
        "buyer_name":     invoice.get("buyer_name"),
        "grand_total":    invoice.get("grand_total"),
        "invoice_date":   invoice.get("invoice_date"),
        "recipient":      body.recipient_email,
        "custom_message": body.message,
        **{k: v for k, v in invoice_data.items()
           if k in ("line_items", "payment_due_date", "total_gst")},
    }

    draft = draft_email(purpose="send invoice", context=context)

    if draft.confidence == 0.0:
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                code="DRAFT_ERROR",
                message=draft.summary,
            ).model_dump(),
        )

    subject = draft.structured_data.get("subject", f"Invoice {invoice.get('invoice_number', '')}")
    email_body = draft.structured_data.get("body", body.message)

    sent = send_email(to=body.recipient_email, subject=subject, body=email_body)

    if not sent:
        raise HTTPException(
            status_code=502,
            detail=ErrorResponse(
                code="SEND_FAILED",
                message="Email could not be sent. Check SMTP credentials in .env.",
            ).model_dump(),
        )

    sent_at = datetime.now(timezone.utc).isoformat()
    supabase.table("invoices").update({"sent_at": sent_at}).eq("id", body.invoice_id).execute()

    return {
        "sent":       True,
        "message_id": str(uuid.uuid4()),
        "sent_at":    sent_at,
        "recipient":  body.recipient_email,
        "subject":    subject,
    }


# ── GET /api/v1/invoices ──────────────────────────────────────────────────────

@router.get("")
async def list_invoices(
    type: Optional[str] = Query(None, description="Filter by invoice_type: received | issued"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return a paginated list of invoices for the current user."""
    valid_types = {"received", "issued"}
    if type is not None and type not in valid_types:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="INVALID_TYPE",
                message=f"type must be 'received' or 'issued', got '{type}'.",
            ).model_dump(),
        )

    query = (
        supabase.table("invoices")
        .select(
            "id, invoice_number, invoice_date, vendor_name, vendor_gstin, "
            "buyer_name, buyer_gstin, grand_total, total_gst, invoice_type, "
            "upload_id, created_at, sent_at",
            count="exact",
        )
        .eq("user_id", current_user["id"])
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )

    if type is not None:
        query = query.eq("invoice_type", type)

    response = query.execute()

    return {
        "total":    response.count or 0,
        "limit":    limit,
        "offset":   offset,
        "invoices": response.data or [],
    }


# ── GET /api/v1/invoices/{invoice_id}/pdf ─────────────────────────────────────

@router.get("/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: str,
    current_user: dict = Depends(get_current_user),
) -> Response:
    """
    Generate and return a PDF for an invoice.
    Fetches the user's profile and letterhead from Supabase, then renders the PDF.
    Works for both uploaded-and-extracted invoices (via analyses) and generated invoices.
    """
    from utils.pdf_generator import generate_invoice_pdf

    user_id = current_user["id"]

    # ── Fetch invoice data ────────────────────────────────────────────────────
    # First try the invoices table (generated invoices)
    inv_row = supabase.table("invoices").select("*").eq("id", invoice_id).eq("user_id", user_id).maybe_single().execute()
    invoice_data: dict = {}

    if inv_row and inv_row.data:
        raw = inv_row.data.get("raw_json") or {}
        invoice_data = raw if isinstance(raw, dict) else json.loads(raw)
        # Merge top-level fields in case raw_json is sparse
        for field in ("invoice_number", "invoice_date", "vendor_name", "vendor_gstin",
                      "buyer_name", "buyer_gstin", "grand_total", "total_gst", "invoice_type"):
            if field not in invoice_data and inv_row.data.get(field) is not None:
                invoice_data[field] = inv_row.data[field]
    else:
        # Fall back to analyses table (uploaded invoices)
        analysis_row = (
            supabase.table("analyses")
            .select("result_json")
            .eq("upload_id", invoice_id)   # invoice_id may be an upload_id here
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if analysis_row and analysis_row.data:
            responses = (analysis_row.data.get("result_json") or {}).get("responses", [])
            invoice_data = responses[0].get("structured_data", {}) if responses else {}

    if not invoice_data:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                code="INVOICE_NOT_FOUND",
                message="No invoice data found for this ID.",
            ).model_dump(),
        )

    # ── Fetch user profile ────────────────────────────────────────────────────
    profile_row = supabase.table("users").select("*").eq("id", user_id).maybe_single().execute()
    profile = profile_row.data if (profile_row and profile_row.data) else {}

    # ── Fetch letterhead ──────────────────────────────────────────────────────
    letterhead_bytes: Optional[bytes] = None
    letterhead_ext:   Optional[str]   = None
    lh_path = profile.get("letterhead_path")

    if lh_path:
        try:
            lh_data = supabase.storage.from_("raseed-uploads").download(lh_path)
            if lh_data:
                letterhead_bytes = lh_data
                letterhead_ext   = lh_path.rsplit(".", 1)[-1]
        except Exception:
            pass  # letterhead fetch failure is non-fatal

    # ── Generate PDF ──────────────────────────────────────────────────────────
    pdf_bytes = generate_invoice_pdf(
        invoice_data=invoice_data,
        profile=profile,
        letterhead_bytes=letterhead_bytes,
        letterhead_ext=letterhead_ext,
    )

    inv_num = invoice_data.get("invoice_number") or invoice_id[:8]
    filename = f"invoice-{inv_num}.pdf".replace("/", "-").replace(" ", "_")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

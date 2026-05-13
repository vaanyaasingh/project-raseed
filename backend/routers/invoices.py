"""Invoices router — extraction, generation, send confirmation, and listing."""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from agents.communication_agent import draft_email, send_email
from middleware.auth import get_current_user
from agents.invoice_agent import extract, generate
from db.database import db_conn
from models.schemas import (
    ErrorResponse,
    InvoiceExtractRequest,
    InvoiceGenerateRequest,
    InvoiceSendRequest,
)

router = APIRouter(prefix="/api/v1/invoices", tags=["invoices"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fetch_upload(upload_id: str) -> dict:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT id, filename, doc_type, extracted_text FROM uploads WHERE id = ?",
            (upload_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                code="UPLOAD_NOT_FOUND",
                message=f"No upload found for id={upload_id}",
            ).model_dump(),
        )
    return dict(row)


def _fetch_invoice(invoice_id: str) -> dict:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT * FROM invoices WHERE id = ?", (invoice_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                code="INVOICE_NOT_FOUND",
                message=f"No invoice found for id={invoice_id}",
            ).model_dump(),
        )
    return dict(row)


def _save_invoice(
    invoice_id: str,
    parsed: dict,
    upload_id: str | None = None,
    user_id: str | None = None,
) -> None:
    with db_conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO invoices
               (id, invoice_number, invoice_date, vendor_name, vendor_gstin,
                buyer_name, buyer_gstin, grand_total, total_gst, invoice_type,
                raw_json, upload_id, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                invoice_id,
                parsed.get("invoice_number"),
                parsed.get("invoice_date"),
                parsed.get("vendor_name"),
                parsed.get("vendor_gstin"),
                parsed.get("buyer_name"),
                parsed.get("buyer_gstin"),
                parsed.get("grand_total"),
                parsed.get("total_gst"),
                parsed.get("invoice_type"),
                json.dumps(parsed),
                upload_id,
                user_id,
            ),
        )


# ── POST /api/v1/invoices/extract ─────────────────────────────────────────────

@router.post("/extract")
async def extract_invoice(
    body: InvoiceExtractRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Extract structured fields from a previously uploaded invoice PDF."""
    upload = _fetch_upload(body.upload_id)

    if upload["doc_type"] != "invoice":
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="WRONG_DOC_TYPE",
                message=f"Expected doc_type='invoice', got '{upload['doc_type']}'.",
            ).model_dump(),
        )

    if not upload.get("extracted_text"):
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="NO_TEXT",
                message="Upload has no extracted text. Re-upload with a clearer PDF.",
            ).model_dump(),
        )

    from models.schemas import DocumentInput
    doc_input = DocumentInput(
        raw_text=upload["extracted_text"],
        doc_type="invoice",
        filename=upload["filename"],
    )

    result = extract(doc_input)

    if result.confidence == 0.0:
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                code="AGENT_ERROR",
                message=result.summary,
            ).model_dump(),
        )

    # invoice_agent.extract() already saved to DB; the invoice_id is injected
    # into structured_data — we just need to link it to this upload_id too
    invoice_id = result.structured_data.get("invoice_id", str(uuid.uuid4()))
    parsed = {k: v for k, v in result.structured_data.items() if k != "invoice_id"}
    _save_invoice(invoice_id, parsed, upload_id=body.upload_id, user_id=current_user["id"])

    return {
        "invoice_id":    invoice_id,
        "upload_id":     body.upload_id,
        "summary":       result.summary,
        "confidence":    result.confidence,
        **result.structured_data,
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

    # invoice_agent.generate() already saved to DB; re-save to stamp user_id
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
    Human-in-the-loop send: this endpoint is only called after the user has
    reviewed and confirmed the draft in the frontend modal.

    Flow: draft_email() → send_email() → mark sent_at in DB.
    """
    invoice = _fetch_invoice(body.invoice_id)

    # Parse stored invoice JSON for context
    raw_json = invoice.get("raw_json") or "{}"
    try:
        invoice_data = json.loads(raw_json)
    except json.JSONDecodeError:
        invoice_data = {}

    # Build email context from invoice fields
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

    # Draft email via communication agent
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

    # Actually send — SMTP credentials must be set or this returns False
    sent = send_email(to=body.recipient_email, subject=subject, body=email_body)

    if not sent:
        raise HTTPException(
            status_code=502,
            detail=ErrorResponse(
                code="SEND_FAILED",
                message="Email could not be sent. Check SMTP credentials in .env.",
            ).model_dump(),
        )

    # Mark invoice as sent
    sent_at = datetime.now(timezone.utc).isoformat()
    with db_conn() as conn:
        conn.execute(
            "UPDATE invoices SET sent_at = ? WHERE id = ?",
            (sent_at, body.invoice_id),
        )

    message_id = str(uuid.uuid4())

    return {
        "sent":       True,
        "message_id": message_id,
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
    """Return a paginated list of invoices, optionally filtered by type."""
    valid_types = {"received", "issued"}
    if type is not None and type not in valid_types:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="INVALID_TYPE",
                message=f"type must be 'received' or 'issued', got '{type}'.",
            ).model_dump(),
        )

    base_query  = "FROM invoices WHERE user_id = ?"
    count_query = f"SELECT COUNT(*) {base_query}"
    data_query  = (
        f"SELECT id, invoice_number, invoice_date, vendor_name, vendor_gstin, "
        f"buyer_name, buyer_gstin, grand_total, total_gst, invoice_type, "
        f"upload_id, created_at, sent_at {base_query}"
    )

    params: list = [current_user["id"]]
    if type is not None:
        type_filter = " AND invoice_type = ?"
        count_query += type_filter
        data_query  += type_filter
        params.append(type)

    data_query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"

    with db_conn() as conn:
        total = conn.execute(count_query, params).fetchone()[0]
        rows  = conn.execute(data_query, params + [limit, offset]).fetchall()

    return {
        "total":    total,
        "limit":    limit,
        "offset":   offset,
        "invoices": [dict(r) for r in rows],
    }

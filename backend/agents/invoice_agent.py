"""Invoice Agent — extracts structured data from uploaded invoices and generates new invoices."""

import json
import uuid

from models.schemas import DocumentInput, AgentResponse, InvoiceGenerateRequest
from utils.gemini_client import call_gemini, AgentTimeoutError, AgentParseError

# ── System prompts (exact, from Agent Prompts page) ──────────────────────────

INVOICE_EXTRACTION_PROMPT = """You are an invoice processing system for an Indian SME.
Extract all structured fields from the following invoice text.

Return JSON matching this schema:
{
  "invoice_number": string,
  "invoice_date": string (ISO date),
  "vendor_name": string,
  "vendor_gstin": string or null,
  "buyer_name": string,
  "buyer_gstin": string or null,
  "line_items": [
    {
      "description": string,
      "quantity": number,
      "unit_price": number,
      "gst_rate": number,
      "total": number
    }
  ],
  "subtotal": number,
  "total_gst": number,
  "grand_total": number,
  "payment_due_date": string or null,
  "invoice_type": "received" | "issued"
}

If a field is not found, return null. All amounts in INR."""

INVOICE_GENERATION_PROMPT = """You are an invoice generator for an Indian SME.
Generate a professional GST-compliant invoice in JSON format based on the following details provided by the user.
Include all mandatory fields required under Indian GST law (GSTIN, HSN/SAC codes if provided, CGST/SGST/IGST split).

Return JSON matching this schema:
{
  "invoice_number": string,
  "invoice_date": string (ISO date, today),
  "vendor_name": string,
  "vendor_gstin": string or null,
  "buyer_name": string,
  "buyer_gstin": string or null,
  "line_items": [
    {
      "description": string,
      "hsn_sac": string or null,
      "quantity": number,
      "unit_price": number,
      "gst_rate": number,
      "cgst": number,
      "sgst": number,
      "igst": number,
      "total": number
    }
  ],
  "subtotal": number,
  "total_cgst": number,
  "total_sgst": number,
  "total_igst": number,
  "total_gst": number,
  "grand_total": number,
  "invoice_type": "issued",
  "payment_due_date": string or null
}

Use CGST+SGST for intra-state (same state code in both GSTINs), IGST for inter-state.
If GSTINs are not provided, default to CGST+SGST. All amounts in INR."""


# ── Helper: persist to Supabase ──────────────────────────────────────────────

def _save_invoice(invoice_id: str, parsed: dict, upload_id: str | None = None) -> None:
    try:
        from db.supabase_client import supabase
        supabase.table("invoices").upsert({
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
        }).execute()
    except Exception:
        pass  # logging failure must never crash the agent


# ── Function 1: Extract ───────────────────────────────────────────────────────

def extract(doc_input: DocumentInput) -> AgentResponse:
    """Extract structured fields from an uploaded invoice PDF."""
    prompt = (
        INVOICE_EXTRACTION_PROMPT
        + "\n\nInvoice text:\n"
        + doc_input.raw_text
        + "\n\nRespond ONLY with valid JSON."
    )

    try:
        parsed = call_gemini(prompt, expect_json=True, agent="invoice_agent_extract")

        invoice_id = str(uuid.uuid4())
        _save_invoice(invoice_id, parsed, upload_id=None)

        parsed["invoice_id"] = invoice_id

        summary = (
            f"Invoice {parsed.get('invoice_number')} "
            f"from {parsed.get('vendor_name')}, "
            f"total {parsed.get('grand_total')} INR"
        )

        return AgentResponse(
            agent="invoice_agent_extract",
            summary=summary,
            structured_data=parsed,
            action_items=[],
            confidence=0.9,
            raw_llm_output=json.dumps(parsed),
        )

    except AgentTimeoutError as exc:
        return AgentResponse(
            agent="invoice_agent_extract",
            summary=f"Request timed out: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output="",
        )

    except AgentParseError as exc:
        return AgentResponse(
            agent="invoice_agent_extract",
            summary=f"Could not parse Gemini response: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output=str(exc),
        )

    except Exception as exc:
        return AgentResponse(
            agent="invoice_agent_extract",
            summary=f"Agent error: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output="",
        )


# ── Function 2: Generate ──────────────────────────────────────────────────────

def generate(request: InvoiceGenerateRequest) -> AgentResponse:
    """Generate a GST-compliant invoice from user-supplied details and save to DB."""
    request_dict = request.model_dump()
    prompt = (
        INVOICE_GENERATION_PROMPT
        + "\n\nInvoice details:\n"
        + json.dumps(request_dict, indent=2)
        + "\n\nRespond ONLY with valid JSON."
    )

    try:
        parsed = call_gemini(prompt, expect_json=True, agent="invoice_agent_generate")

        invoice_id = str(uuid.uuid4())
        _save_invoice(invoice_id, parsed, upload_id=None)

        parsed["invoice_id"] = invoice_id

        summary = (
            f"Invoice {parsed.get('invoice_number')} "
            f"from {parsed.get('vendor_name')}, "
            f"total {parsed.get('grand_total')} INR"
        )

        return AgentResponse(
            agent="invoice_agent_generate",
            summary=summary,
            structured_data=parsed,
            action_items=[],
            confidence=0.9,
            raw_llm_output=json.dumps(parsed),
        )

    except AgentTimeoutError as exc:
        return AgentResponse(
            agent="invoice_agent_generate",
            summary=f"Request timed out: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output="",
        )

    except AgentParseError as exc:
        return AgentResponse(
            agent="invoice_agent_generate",
            summary=f"Could not parse Gemini response: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output=str(exc),
        )

    except Exception as exc:
        return AgentResponse(
            agent="invoice_agent_generate",
            summary=f"Agent error: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output="",
        )

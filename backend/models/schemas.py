"""Pydantic v2 request/response models — shared across all agents and API endpoints."""

from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Literal
from decimal import Decimal


# ── Agent core types ─────────────────────────────────────────────────────────

class DocumentInput(BaseModel):
    raw_text: str
    doc_type: Literal["gst_notice", "invoice", "bank_statement"]
    filename: str


class AgentResponse(BaseModel):
    agent: str
    summary: str
    structured_data: dict
    action_items: List[str]
    confidence: float
    raw_llm_output: str


class OrchestratorResponse(BaseModel):
    agents_invoked: List[str]
    responses: List[AgentResponse]
    integrated_insight: Optional[str] = None


# ── Upload endpoints ─────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    upload_id: str
    filename: str
    doc_type: Literal["gst_notice", "invoice", "bank_statement"]
    extracted_text_preview: str
    status: str


class DateRange(BaseModel):
    start: str
    end: str


class BankStatementUploadResponse(BaseModel):
    upload_id: str
    rows_parsed: int
    date_range: DateRange
    status: str


# ── Query endpoints ──────────────────────────────────────────────────────────

class GSTQueryRequest(BaseModel):
    upload_id: str


class FinanceQueryRequest(BaseModel):
    upload_id: str


class IntegratedQueryRequest(BaseModel):
    gst_upload_id: str
    finance_upload_id: str


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    source: str


# ── Invoice endpoints ─────────────────────────────────────────────────────────

class LineItem(BaseModel):
    description: str
    quantity: float
    unit_price: float
    gst_rate: float
    total: Optional[float] = None

    def model_post_init(self, __context) -> None:
        if self.total is None:
            gst_amount = self.unit_price * self.quantity * (self.gst_rate / 100)
            self.total = round(self.unit_price * self.quantity + gst_amount, 2)


class InvoiceExtractRequest(BaseModel):
    upload_id: str


class InvoiceGenerateRequest(BaseModel):
    vendor_name: str
    vendor_gstin: Optional[str] = None
    buyer_name: str
    buyer_gstin: Optional[str] = None
    line_items: List[LineItem]


class InvoiceSendRequest(BaseModel):
    invoice_id: str
    recipient_email: str
    message: str


# ── Error response ────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    error: bool = True
    code: str
    message: str
    detail: Optional[str] = None

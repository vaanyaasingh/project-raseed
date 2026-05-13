"""Invoices router — /api/v1/invoices/* endpoints for extraction, generation, and send confirmation."""

from fastapi import APIRouter, UploadFile

from agents.invoice_agent import InvoiceAgent
from agents.communication_agent import CommunicationAgent

router = APIRouter(prefix="/api/v1/invoices", tags=["invoices"])

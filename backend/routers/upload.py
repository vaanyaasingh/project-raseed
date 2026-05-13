"""Upload router — POST /api/v1/upload/document and POST /api/v1/upload/bank-statement."""

from fastapi import APIRouter, UploadFile, Form

from preprocessing.pdf_extractor import extract_text
from preprocessing.bank_statement_parser import parse_bank_statement
from db.database import get_db
from models.schemas import UploadResponse, BankStatementUploadResponse

router = APIRouter(prefix="/api/v1/upload", tags=["upload"])

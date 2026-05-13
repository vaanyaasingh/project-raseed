"""Upload router — POST /api/v1/upload/document and POST /api/v1/upload/bank-statement."""

import os
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from db.database import db_conn
from middleware.auth import get_current_user
from models.schemas import (
    BankStatementUploadResponse,
    DateRange,
    ErrorResponse,
    UploadResponse,
)
from preprocessing.bank_statement_parser import parse_bank_statement
from preprocessing.pdf_extractor import extract_text

router = APIRouter(prefix="/api/v1/upload", tags=["upload"])

_MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB
_TMP_DIR = "/tmp"
_VALID_DOC_TYPES = {"gst_notice", "invoice", "bank_statement"}


# ── GET /api/v1/upload/list ───────────────────────────────────────────────────

@router.get("/list")
async def list_uploads(
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return the current user's past uploads, newest first."""
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT id, filename, doc_type, created_at FROM uploads "
            "WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (current_user["id"], limit),
        ).fetchall()
    return {"uploads": [dict(r) for r in rows]}


# ── POST /api/v1/upload/document ─────────────────────────────────────────────

@router.post("/document", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    current_user: dict = Depends(get_current_user),
) -> UploadResponse:
    """Accept a PDF + doc_type, extract text, persist to uploads table."""

    if doc_type not in _VALID_DOC_TYPES:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="INVALID_DOC_TYPE",
                message=f"doc_type must be one of: {', '.join(sorted(_VALID_DOC_TYPES))}",
            ).model_dump(),
        )

    filename = file.filename or "upload.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="INVALID_FILE_TYPE",
                message="Only PDF files are accepted for document upload.",
            ).model_dump(),
        )

    contents = await file.read()
    if len(contents) > _MAX_PDF_BYTES:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="FILE_TOO_LARGE",
                message=f"File exceeds 10 MB limit ({len(contents) // (1024 * 1024)} MB received).",
            ).model_dump(),
        )

    upload_id = str(uuid.uuid4())
    tmp_path = os.path.join(_TMP_DIR, f"{upload_id}_{filename}")

    with open(tmp_path, "wb") as f:
        f.write(contents)

    try:
        raw_text, _method = extract_text(tmp_path)
    except ValueError as exc:
        if "LOW_QUALITY_EXTRACT" in str(exc):
            raise HTTPException(
                status_code=422,
                detail=ErrorResponse(
                    code="LOW_QUALITY_EXTRACT",
                    message="Could not extract readable text from this PDF. Try a higher-quality scan.",
                ).model_dump(),
            )
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        _cleanup(tmp_path)

    with db_conn() as conn:
        conn.execute(
            "INSERT INTO uploads (id, filename, doc_type, extracted_text, user_id) VALUES (?, ?, ?, ?, ?)",
            (upload_id, filename, doc_type, raw_text, current_user["id"]),
        )

    return UploadResponse(
        upload_id=upload_id,
        filename=filename,
        doc_type=doc_type,
        extracted_text_preview=raw_text[:200],
        status="ok",
    )


# ── POST /api/v1/upload/bank-statement ───────────────────────────────────────

@router.post("/bank-statement", response_model=BankStatementUploadResponse)
async def upload_bank_statement(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> BankStatementUploadResponse:
    """Accept a CSV bank statement, parse rows, persist upload + transactions."""

    filename = file.filename or "statement.csv"
    if not filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="INVALID_FILE_TYPE",
                message="Only CSV files are accepted for bank statement upload.",
            ).model_dump(),
        )

    contents = await file.read()

    upload_id = str(uuid.uuid4())
    tmp_path = os.path.join(_TMP_DIR, f"{upload_id}_{filename}")

    with open(tmp_path, "wb") as f:
        f.write(contents)

    try:
        df, meta = parse_bank_statement(tmp_path)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="PARSE_ERROR",
                message=f"Could not parse bank statement: {exc}",
            ).model_dump(),
        )
    finally:
        _cleanup(tmp_path)

    if df.empty:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="EMPTY_STATEMENT",
                message="No transaction rows found in the uploaded file.",
            ).model_dump(),
        )

    with db_conn() as conn:
        conn.execute(
            "INSERT INTO uploads (id, filename, doc_type, extracted_text, user_id) VALUES (?, ?, ?, ?, ?)",
            (upload_id, filename, "bank_statement", None, current_user["id"]),
        )
        rows = [
            (
                str(uuid.uuid4()),
                str(row.get("date", "")),
                str(row.get("description", "")),
                float(abs(row.get("net_amount", 0))),
                str(row.get("type", "debit")),
                None,   # category — not assigned at upload time
                upload_id,
            )
            for row in df.to_dict(orient="records")
        ]
        conn.executemany(
            "INSERT INTO transactions (id, date, description, amount, type, category, upload_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            rows,
        )

    # Build DateRange from parser meta or fall back to DataFrame values
    date_range_raw = meta.get("date_range", {})
    if isinstance(date_range_raw, dict) and date_range_raw.get("start"):
        date_range = DateRange(
            start=str(date_range_raw["start"]),
            end=str(date_range_raw["end"]),
        )
    else:
        dates = df["date"].dropna().astype(str)
        date_range = DateRange(
            start=dates.min() if not dates.empty else "",
            end=dates.max() if not dates.empty else "",
        )

    return BankStatementUploadResponse(
        upload_id=upload_id,
        rows_parsed=len(df),
        date_range=date_range,
        status="ok",
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _cleanup(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass

"""Upload router — POST /api/v1/upload/document and /bank-statement.
Analysis runs immediately during upload; results stored in Supabase.
"""

import os
import uuid
import tempfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from db.supabase_client import supabase
from middleware.auth import get_current_user
from models.schemas import (
    DocumentInput,
    ErrorResponse,
    OrchestratorResponse,
)
from preprocessing.bank_statement_parser import parse_bank_statement
from preprocessing.pdf_bank_parser import parse_bank_statement_pdf
from preprocessing.pdf_extractor import extract_text
from agents.orchestrator import orchestrate

router = APIRouter(prefix="/api/v1/upload", tags=["upload"])

_MAX_PDF_BYTES = 10 * 1024 * 1024  # 10 MB
_BUCKET = "raseed-uploads"
_VALID_DOC_TYPES = {"gst_notice", "invoice", "bank_statement"}


def _extract_todo_items(result: OrchestratorResponse, analysis_type: str) -> list:
    """Pull structured action items out of the orchestrator result."""
    todos = []
    for resp in result.responses:
        if analysis_type == "gst_notice" and "compliance" in resp.agent:
            checklist = resp.structured_data.get("action_checklist", [])
            todos.extend(checklist)
        elif analysis_type in ("bank_statement", "invoice"):
            todos.extend([{"task": a} for a in resp.action_items])
    if not todos and result.responses:
        todos = [{"task": a} for a in result.responses[0].action_items]
    return todos


def _upload_to_storage(
    user_id: str, upload_id: str, filename: str, data: bytes, content_type: str
) -> str:
    """Upload file bytes to Supabase Storage, return storage path."""
    path = f"{user_id}/{upload_id}/{filename}"
    try:
        supabase.storage.from_(_BUCKET).upload(
            path=path,
            file=data,
            file_options={"content-type": content_type, "upsert": "false"},
        )
    except Exception:
        # If already exists (re-upload), remove and retry
        try:
            supabase.storage.from_(_BUCKET).remove([path])
            supabase.storage.from_(_BUCKET).upload(
                path=path,
                file=data,
                file_options={"content-type": content_type},
            )
        except Exception:
            pass  # storage failure is non-fatal; analysis result still stored in DB
    return path


# ── POST /api/v1/upload/document ─────────────────────────────────────────────

@router.post("/document")
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Upload PDF, extract text, run Gemini analysis, store everything in Supabase."""
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
                message="File exceeds 10 MB limit.",
            ).model_dump(),
        )

    upload_id = str(uuid.uuid4())
    user_id = current_user["id"]

    # 1. Upload to Supabase Storage
    storage_path = _upload_to_storage(user_id, upload_id, filename, contents, "application/pdf")

    # 2. Insert upload row (status: pending)
    supabase.table("uploads").insert({
        "id": upload_id,
        "user_id": user_id,
        "filename": filename,
        "storage_path": storage_path,
        "file_type": doc_type,
        "analysis_status": "pending",
    }).execute()

    # 3. Extract text from PDF
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name
        raw_text, _ = extract_text(tmp_path)
    except ValueError as exc:
        supabase.table("uploads").update({"analysis_status": "failed"}).eq("id", upload_id).execute()
        if "LOW_QUALITY_EXTRACT" in str(exc):
            raise HTTPException(
                status_code=422,
                detail=ErrorResponse(
                    code="LOW_QUALITY_EXTRACT",
                    message="Could not extract readable text from this PDF. Try a higher-quality scan.",
                ).model_dump(),
            )
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        supabase.table("uploads").update({"analysis_status": "failed"}).eq("id", upload_id).execute()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    if not raw_text.strip():
        supabase.table("uploads").update({"analysis_status": "failed"}).eq("id", upload_id).execute()
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="NO_TEXT",
                message="Could not extract text from PDF.",
            ).model_dump(),
        )

    # 4. Run Gemini analysis
    doc_input = DocumentInput(raw_text=raw_text, doc_type=doc_type, filename=filename)
    from agents.orchestrator import classify_intent
    agent_type = classify_intent(doc_type)   # gst_notice | invoice_upload | bank_statement
    result: OrchestratorResponse = orchestrate(agent_type, {"doc_input": doc_input})

    todo_items = _extract_todo_items(result, doc_type)

    # 5. Store analysis result in Supabase
    supabase.table("analyses").insert({
        "upload_id": upload_id,
        "user_id": user_id,
        "analysis_type": doc_type,
        "result_json": result.model_dump(),
        "todo_items": todo_items,
    }).execute()

    # 6. Update upload status
    supabase.table("uploads").update({"analysis_status": "complete"}).eq("id", upload_id).execute()

    return {
        "upload_id": upload_id,
        "filename": filename,
        "doc_type": doc_type,
        "analysis": result.model_dump(),
        "todo_items": todo_items,
        "status": "ok",
    }


# ── POST /api/v1/upload/bank-statement ───────────────────────────────────────

@router.post("/bank-statement")
async def upload_bank_statement(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Upload CSV or PDF bank statement, parse, run finance analysis, store in Supabase."""
    filename = file.filename or "statement"
    fname_lower = filename.lower()
    is_pdf = fname_lower.endswith(".pdf")
    is_csv = fname_lower.endswith(".csv")

    if not is_pdf and not is_csv:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="INVALID_FILE_TYPE",
                message="Only CSV or PDF files are accepted for bank statement upload.",
            ).model_dump(),
        )

    contents = await file.read()
    upload_id = str(uuid.uuid4())
    user_id = current_user["id"]

    content_type = "application/pdf" if is_pdf else "text/csv"

    # 1. Upload to Supabase Storage
    storage_path = _upload_to_storage(user_id, upload_id, filename, contents, content_type)

    # 2. Insert upload row
    supabase.table("uploads").insert({
        "id": upload_id,
        "user_id": user_id,
        "filename": filename,
        "storage_path": storage_path,
        "file_type": "bank_statement",
        "analysis_status": "pending",
    }).execute()

    # 3. Parse file (CSV or PDF)
    tmp_path = None
    try:
        suffix = ".pdf" if is_pdf else ".csv"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False, mode="wb") as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        if is_pdf:
            df, meta = parse_bank_statement_pdf(tmp_path)
        else:
            df, meta = parse_bank_statement(tmp_path)
    except Exception as exc:
        supabase.table("uploads").update({"analysis_status": "failed"}).eq("id", upload_id).execute()
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="PARSE_ERROR",
                message=f"Could not parse bank statement: {exc}",
            ).model_dump(),
        )
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except Exception:
                pass

    if df.empty:
        supabase.table("uploads").update({"analysis_status": "failed"}).eq("id", upload_id).execute()
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="EMPTY_STATEMENT",
                message="No transaction rows found in the uploaded file.",
            ).model_dump(),
        )

    # Reconstruct columns expected by finance agent
    df["net_amount"] = df.apply(
        lambda r: r["amount"] if r.get("type") == "credit" else -r["amount"], axis=1
    )
    df["credit"] = df.apply(lambda r: r["amount"] if r.get("type") == "credit" else 0, axis=1)
    df["debit"] = df.apply(lambda r: r["amount"] if r.get("type") == "debit" else 0, axis=1)

    # 4. Run finance analysis
    result: OrchestratorResponse = orchestrate("bank_statement", {"df": df})
    todo_items = _extract_todo_items(result, "bank_statement")

    # Build date range
    date_range_raw = meta.get("date_range", {})
    if isinstance(date_range_raw, dict) and date_range_raw.get("start"):
        date_range = {
            "start": str(date_range_raw["start"]),
            "end": str(date_range_raw["end"]),
        }
    else:
        dates = df["date"].dropna().astype(str)
        date_range = {
            "start": dates.min() if not dates.empty else "",
            "end": dates.max() if not dates.empty else "",
        }

    # 5. Store analysis
    supabase.table("analyses").insert({
        "upload_id": upload_id,
        "user_id": user_id,
        "analysis_type": "bank_statement",
        "result_json": result.model_dump(),
        "todo_items": todo_items,
    }).execute()

    # 6. Update status
    supabase.table("uploads").update({"analysis_status": "complete"}).eq("id", upload_id).execute()

    return {
        "upload_id": upload_id,
        "filename": filename,
        "doc_type": "bank_statement",
        "rows_parsed": len(df),
        "date_range": date_range,
        "analysis": result.model_dump(),
        "todo_items": todo_items,
        "status": "ok",
    }


# ── GET /api/v1/upload/list ───────────────────────────────────────────────────

@router.get("/list")
async def list_uploads(
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return the current user's uploads with their analyses, newest first."""
    response = (
        supabase.table("uploads")
        .select(
            "id, filename, file_type, analysis_status, uploaded_at, "
            "analyses(id, analysis_type, todo_items, created_at)"
        )
        .eq("user_id", current_user["id"])
        .order("uploaded_at", desc=True)
        .limit(limit)
        .execute()
    )
    return {"uploads": response.data or []}


# ── DELETE /api/v1/upload/{upload_id} ────────────────────────────────────────

@router.delete("/{upload_id}")
async def delete_upload(
    upload_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Delete an upload and its analysis. Also removes the file from Supabase Storage."""
    user_id = current_user["id"]

    # Verify ownership
    row = (
        supabase.table("uploads")
        .select("id, storage_path")
        .eq("id", upload_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not row or not row.data:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                code="UPLOAD_NOT_FOUND",
                message=f"No upload found for id={upload_id}",
            ).model_dump(),
        )

    storage_path = row.data.get("storage_path")

    # Delete from Storage (best-effort)
    if storage_path:
        try:
            supabase.storage.from_(_BUCKET).remove([storage_path])
        except Exception:
            pass

    # Delete analyses rows (CASCADE should handle this, but explicit is safer)
    supabase.table("analyses").delete().eq("upload_id", upload_id).execute()

    # Delete upload row
    supabase.table("uploads").delete().eq("id", upload_id).eq("user_id", user_id).execute()

    return {"deleted": True, "upload_id": upload_id}


# ── GET /api/v1/upload/{upload_id}/analysis ───────────────────────────────────

@router.get("/{upload_id}/analysis")
async def get_analysis(
    upload_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return cached analysis for an upload. Never calls Gemini."""
    response = (
        supabase.table("analyses")
        .select("*")
        .eq("upload_id", upload_id)
        .eq("user_id", current_user["id"])
        .single()
        .execute()
    )
    if not response.data:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                code="ANALYSIS_NOT_FOUND",
                message=f"No analysis found for upload_id={upload_id}",
            ).model_dump(),
        )
    return response.data

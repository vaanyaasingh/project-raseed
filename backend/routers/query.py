"""Query router — GST notice analysis, finance analysis, integrated cross-domain query, and freeform Q&A."""

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException

from agents.orchestrator import orchestrate, _cross_domain_insight
from middleware.auth import get_current_user
from db.database import db_conn
from db.vector_store import query_knowledge_base
from models.schemas import (
    AskRequest,
    AskResponse,
    DocumentInput,
    ErrorResponse,
    FinanceQueryRequest,
    GSTQueryRequest,
    IntegratedQueryRequest,
    OrchestratorResponse,
)
from utils.gemini_client import call_gemini

router = APIRouter(prefix="/api/v1/query", tags=["query"])


# ── Analysis result cache ─────────────────────────────────────────────────────

def _get_cached(upload_id: str, query_type: str) -> OrchestratorResponse | None:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT result_json FROM analysis_results WHERE upload_id = ? AND query_type = ?",
            (upload_id, query_type),
        ).fetchone()
    if row is None:
        return None
    try:
        return OrchestratorResponse.model_validate_json(row["result_json"])
    except Exception:
        return None


def _save_cached(upload_id: str, query_type: str, result: OrchestratorResponse) -> None:
    try:
        with db_conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO analysis_results (upload_id, query_type, result_json)
                   VALUES (?, ?, ?)""",
                (upload_id, query_type, result.model_dump_json()),
            )
    except Exception:
        pass  # caching failure must not break the response


# ── Upload helpers ─────────────────────────────────────────────────────────────

def _fetch_upload_text(upload_id: str, expected_doc_type=None) -> tuple:
    """
    Return (extracted_text, doc_type) for an upload_id.
    Raises 404 if not found, 422 if doc_type mismatches.
    """
    with db_conn() as conn:
        row = conn.execute(
            "SELECT extracted_text, doc_type FROM uploads WHERE id = ?", (upload_id,)
        ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                code="UPLOAD_NOT_FOUND",
                message=f"No upload found for id={upload_id}",
            ).model_dump(),
        )

    if expected_doc_type and row["doc_type"] != expected_doc_type:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="WRONG_DOC_TYPE",
                message=f"Expected doc_type='{expected_doc_type}', got '{row['doc_type']}'.",
            ).model_dump(),
        )

    return row["extracted_text"] or "", row["doc_type"]


def _fetch_transactions_df(upload_id: str) -> pd.DataFrame:
    """Return a DataFrame of transactions for the given upload_id. Raises 404 if none found."""
    with db_conn() as conn:
        rows = conn.execute(
            "SELECT date, description, amount, type FROM transactions WHERE upload_id = ?",
            (upload_id,),
        ).fetchall()

    if not rows:
        raise HTTPException(
            status_code=404,
            detail=ErrorResponse(
                code="TRANSACTIONS_NOT_FOUND",
                message=f"No transactions found for upload_id={upload_id}. "
                        "Upload a bank statement first.",
            ).model_dump(),
        )

    df = pd.DataFrame([dict(r) for r in rows])
    # Reconstruct net_amount and credit/debit columns expected by finance_agent
    df["net_amount"] = df.apply(
        lambda r: r["amount"] if r["type"] == "credit" else -r["amount"], axis=1
    )
    df["credit"] = df.apply(lambda r: r["amount"] if r["type"] == "credit" else 0, axis=1)
    df["debit"]  = df.apply(lambda r: r["amount"] if r["type"] == "debit"  else 0, axis=1)
    return df


# ── POST /api/v1/query/gst-notice ────────────────────────────────────────────

@router.post("/gst-notice", response_model=OrchestratorResponse)
async def query_gst_notice(
    body: GSTQueryRequest,
    current_user: dict = Depends(get_current_user),
) -> OrchestratorResponse:
    """
    Analyse a previously uploaded GST notice.
    Runs gst_tax_agent + compliance_agent and returns merged structured data.
    """
    cached = _get_cached(body.upload_id, "gst_notice")
    if cached:
        return cached

    raw_text, doc_type = _fetch_upload_text(body.upload_id)

    if not raw_text:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="NO_TEXT",
                message="Upload has no extracted text. Re-upload with a clearer PDF.",
            ).model_dump(),
        )

    doc_input = DocumentInput(
        raw_text=raw_text,
        doc_type="gst_notice",
        filename=f"{body.upload_id}.pdf",
    )

    result = orchestrate("gst_notice", {"doc_input": doc_input})
    _save_cached(body.upload_id, "gst_notice", result)
    return result


# ── POST /api/v1/query/finance ────────────────────────────────────────────────

@router.post("/finance", response_model=OrchestratorResponse)
async def query_finance(
    body: FinanceQueryRequest,
    current_user: dict = Depends(get_current_user),
) -> OrchestratorResponse:
    """Analyse transactions from a previously uploaded bank statement."""
    cached = _get_cached(body.upload_id, "bank_statement")
    if cached:
        return cached

    _fetch_upload_text(body.upload_id, expected_doc_type="bank_statement")
    df = _fetch_transactions_df(body.upload_id)
    result = orchestrate("bank_statement", {"df": df})
    _save_cached(body.upload_id, "bank_statement", result)
    return result


# ── POST /api/v1/query/integrated ─────────────────────────────────────────────

@router.post("/integrated", response_model=OrchestratorResponse)
async def query_integrated(
    body: IntegratedQueryRequest,
    current_user: dict = Depends(get_current_user),
) -> OrchestratorResponse:
    """
    Cross-domain analysis: correlate a GST notice with bank transactions.
    Runs gst_tax_agent + compliance_agent + finance_agent, then generates
    an integrated insight linking the two.
    """
    gst_text, _  = _fetch_upload_text(body.gst_upload_id, expected_doc_type="gst_notice")
    _fetch_upload_text(body.finance_upload_id, expected_doc_type="bank_statement")
    fin_df = _fetch_transactions_df(body.finance_upload_id)

    if not gst_text:
        raise HTTPException(
            status_code=422,
            detail=ErrorResponse(
                code="NO_TEXT",
                message="GST upload has no extracted text. Re-upload with a clearer PDF.",
            ).model_dump(),
        )

    doc_input = DocumentInput(
        raw_text=gst_text,
        doc_type="gst_notice",
        filename=f"{body.gst_upload_id}.pdf",
    )

    # Run each domain independently so agents receive clean, purpose-built payloads
    gst_result = orchestrate("gst_notice", {"doc_input": doc_input})
    fin_result = orchestrate("bank_statement", {"df": fin_df})

    # Collect per-agent outputs for the combined response
    all_responses = gst_result.responses + fin_result.responses
    all_agents    = gst_result.agents_invoked + fin_result.agents_invoked

    # Cross-domain insight: correlate GST structured data with finance structured data
    gst_agent_data  = next((r.structured_data for r in gst_result.responses
                            if r.agent == "gst_tax_agent"), {})
    fin_agent_data  = next((r.structured_data for r in fin_result.responses
                            if r.agent == "finance_agent"), {})

    integrated_insight = None
    if gst_agent_data and fin_agent_data:
        integrated_insight = _cross_domain_insight(gst_agent_data, fin_agent_data)

    return OrchestratorResponse(
        agents_invoked=all_agents,
        responses=all_responses,
        integrated_insight=integrated_insight,
    )


# ── POST /api/v1/query/ask ────────────────────────────────────────────────────

@router.post("/ask", response_model=AskResponse)
async def ask(
    body: AskRequest,
    current_user: dict = Depends(get_current_user),
) -> AskResponse:
    """
    Freeform GST Q&A with RAG: retrieve relevant regulation snippets from
    ChromaDB, append as context, then call Gemini for a plain-text answer.
    """
    snippets = query_knowledge_base(body.question, n_results=3)

    if snippets:
        context_block = "\n\n".join(f"[{i + 1}] {s}" for i, s in enumerate(snippets))
        prompt = (
            "You are a GST compliance expert for Indian SMEs.\n"
            "Use the following GST regulation excerpts to answer the question.\n\n"
            f"Context:\n{context_block}\n\n"
            f"Question: {body.question}\n\n"
            "Answer concisely and accurately. If the context does not cover the question, "
            "say so and answer from your general knowledge."
        )
        source = "GST Knowledge Base"
    else:
        prompt = (
            "You are a GST compliance expert for Indian SMEs.\n"
            f"Question: {body.question}\n\n"
            "Answer concisely and accurately."
        )
        source = "Gemini (knowledge base not yet seeded)"

    answer = call_gemini(prompt, expect_json=False, agent="ask_endpoint")
    return AskResponse(answer=str(answer), source=source)

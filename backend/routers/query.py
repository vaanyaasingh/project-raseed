"""Query router — freeform GST Q&A with RAG."""

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from db.vector_store import query_knowledge_base
from models.schemas import AskRequest, AskResponse
from utils.gemini_client import call_gemini

router = APIRouter(prefix="/api/v1/query", tags=["query"])


# ── POST /api/v1/query/ask ────────────────────────────────────────────────────

@router.post("/ask", response_model=AskResponse)
async def ask(
    body: AskRequest,
    current_user: dict = Depends(get_current_user),
) -> AskResponse:
    """
    Freeform GST Q&A with RAG: retrieve relevant regulation snippets from
    ChromaDB, append as context, then call Gemini for a plain-text answer.
    Analysis of uploaded documents now happens at upload time — use
    GET /api/v1/upload/{upload_id}/analysis to retrieve cached results.
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

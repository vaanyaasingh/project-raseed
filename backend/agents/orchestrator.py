"""MCP orchestrator — classifies intent and routes requests to the correct agent(s)."""

import json

from models.schemas import DocumentInput, AgentResponse, OrchestratorResponse, InvoiceGenerateRequest
from utils.gemini_client import call_gemini

# ── Intent map (exact, from CONTEXT.md) ─────────────────────────────────────

INTENT_MAP: dict[str, list[str]] = {
    "gst_notice":       ["gst_tax_agent", "compliance_agent"],
    "invoice_upload":   ["invoice_agent"],
    "invoice_generate": ["invoice_agent", "communication_agent"],
    "bank_statement":   ["finance_agent"],
    "general_query":    ["gst_tax_agent"],
}

# ── Cross-domain insight prompt (exact, from CONTEXT.md) ─────────────────────

_CROSS_DOMAIN_PROMPT = """Given the following GST notice analysis and bank transaction analysis for the same business,
identify any direct connections between them.
For example: missing invoices that correspond to bank credits, or payments that match penalty amounts.
Return a single plain-English insight of 2-3 sentences."""


# ── Intent classifier ────────────────────────────────────────────────────────

def classify_intent(doc_type: str) -> str:
    """Map an uploaded document type to an orchestrator intent key."""
    return {
        "gst_notice":      "gst_notice",
        "invoice":         "invoice_upload",
        "bank_statement":  "bank_statement",
    }.get(doc_type, "general_query")


# ── Per-agent dispatch ────────────────────────────────────────────────────────

def _run_agent(agent_name: str, payload: dict) -> AgentResponse:
    """Call the correct agent function based on agent_name."""

    if agent_name == "gst_tax_agent":
        from agents.gst_tax_agent import run as gst_run
        doc_input = payload.get("doc_input") or DocumentInput(
            raw_text=payload.get("raw_text", ""),
            doc_type="gst_notice",
            filename=payload.get("filename", "notice.pdf"),
        )
        return gst_run(doc_input)

    if agent_name == "compliance_agent":
        from agents.compliance_agent import run as comp_run
        # Compliance agent takes the GST agent's AgentResponse
        gst_response = payload.get("gst_response")
        if gst_response is None:
            return AgentResponse(
                agent="compliance_agent",
                summary="No GST agent output available to run compliance agent.",
                structured_data={},
                action_items=[],
                confidence=0.0,
                raw_llm_output="",
            )
        return comp_run(gst_response)

    if agent_name == "finance_agent":
        from agents.finance_agent import run as fin_run
        import pandas as pd
        df = payload.get("df")
        if df is None:
            return AgentResponse(
                agent="finance_agent",
                summary="No DataFrame available to run finance agent.",
                structured_data={},
                action_items=[],
                confidence=0.0,
                raw_llm_output="",
            )
        return fin_run(df)

    if agent_name == "invoice_agent":
        mode = payload.get("mode", "extract")
        if mode == "generate":
            from agents.invoice_agent import generate
            req = payload.get("invoice_request")
            if req is None:
                return AgentResponse(
                    agent="invoice_agent_generate",
                    summary="No invoice request provided.",
                    structured_data={}, action_items=[], confidence=0.0, raw_llm_output="",
                )
            return generate(req)
        else:
            from agents.invoice_agent import extract
            doc_input = payload.get("doc_input") or DocumentInput(
                raw_text=payload.get("raw_text", ""),
                doc_type="invoice",
                filename=payload.get("filename", "invoice.pdf"),
            )
            return extract(doc_input)

    if agent_name == "communication_agent":
        from agents.communication_agent import draft_email
        return draft_email(
            purpose=payload.get("purpose", "send invoice"),
            context=payload.get("context", {}),
        )

    return AgentResponse(
        agent=agent_name,
        summary=f"Unknown agent: {agent_name}",
        structured_data={}, action_items=[], confidence=0.0, raw_llm_output="",
    )


# ── Cross-domain insight ──────────────────────────────────────────────────────

def _cross_domain_insight(gst_data: dict, finance_data: dict) -> str | None:
    """Run an LLM call to correlate GST notice analysis with bank transaction analysis."""
    prompt = (
        _CROSS_DOMAIN_PROMPT
        + "\n\nGST notice analysis:\n"
        + json.dumps(gst_data, indent=2)
        + "\n\nBank transaction analysis:\n"
        + json.dumps(finance_data, indent=2)
    )
    try:
        return call_gemini(prompt, expect_json=False, agent="orchestrator_cross_domain")
    except Exception:
        return None


# ── Main orchestrate function ─────────────────────────────────────────────────

def orchestrate(intent: str, payload: dict) -> OrchestratorResponse:
    """
    Route a request to the correct agent(s) and return a unified OrchestratorResponse.

    Args:
        intent:   one of the INTENT_MAP keys (use classify_intent() to derive from doc_type)
        payload:  dict passed to each agent — keys vary by agent (see _run_agent)
    """
    agents_to_run = INTENT_MAP.get(intent, INTENT_MAP["general_query"])
    responses: list[AgentResponse] = []
    agent_outputs: dict[str, AgentResponse] = {}

    for agent_name in agents_to_run:
        # Compliance agent needs the GST agent's response in the payload
        if agent_name == "compliance_agent" and "gst_tax_agent" in agent_outputs:
            payload = {**payload, "gst_response": agent_outputs["gst_tax_agent"]}

        response = _run_agent(agent_name, payload)
        responses.append(response)
        agent_outputs[agent_name] = response

    # Cross-domain insight when both GST and Finance ran in the same request
    integrated_insight: str | None = None
    if "gst_tax_agent" in agent_outputs and "finance_agent" in agent_outputs:
        gst_data = agent_outputs["gst_tax_agent"].structured_data
        fin_data = agent_outputs["finance_agent"].structured_data
        if gst_data and fin_data:
            integrated_insight = _cross_domain_insight(gst_data, fin_data)

    return OrchestratorResponse(
        agents_invoked=list(agent_outputs.keys()),
        responses=responses,
        integrated_insight=integrated_insight,
    )

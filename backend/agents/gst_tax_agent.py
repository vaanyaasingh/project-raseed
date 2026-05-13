"""GST Tax Agent — interprets GST notices (ASMT-10, DRC-01, GSTR-3A) and returns structured analysis."""

import json

from models.schemas import DocumentInput, AgentResponse
from utils.gemini_client import call_gemini, AgentTimeoutError, AgentParseError

# ── System prompt (exact, from Agent Prompts page) ───────────────────────────

GST_SYSTEM_PROMPT = """You are a GST compliance expert for Indian businesses.
You will be given raw text extracted from a GST notice issued by the Indian tax authorities.

Your job is to:
1. Identify the notice type (e.g., ASMT-10, DRC-01, GSTR-3A, etc.)
2. Extract: the reason for the notice, the tax period it covers, the deadline for response, and any penalty amount mentioned
3. Explain the notice in simple Hindi-English (Hinglish) or plain English that a non-CA business owner can understand
4. List exactly what the business needs to do next, in order
5. Flag if this notice requires immediate legal consultation

Return your response as JSON matching this schema:
{
  "notice_type": string,
  "reason": string,
  "tax_period": string,
  "deadline": string (ISO date if possible),
  "penalty_amount": number or null,
  "plain_explanation": string,
  "action_items": [string],
  "requires_legal_help": boolean
}"""

# ── Agent entry point ─────────────────────────────────────────────────────────

def run(doc_input: DocumentInput) -> AgentResponse:
    """Analyse a GST notice and return a structured AgentResponse."""
    prompt = (
        GST_SYSTEM_PROMPT
        + "\n\nNotice text:\n"
        + doc_input.raw_text
        + "\n\nRespond ONLY with valid JSON."
    )

    try:
        parsed = call_gemini(prompt, expect_json=True, agent="gst_tax_agent")

        return AgentResponse(
            agent="gst_tax_agent",
            summary=parsed.get("plain_explanation", "No explanation returned."),
            structured_data=parsed,
            action_items=parsed.get("action_items", []),
            confidence=0.6 if parsed.get("requires_legal_help") else 0.9,
            raw_llm_output=json.dumps(parsed),
        )

    except AgentTimeoutError as exc:
        return AgentResponse(
            agent="gst_tax_agent",
            summary=f"Request timed out: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output="",
        )

    except AgentParseError as exc:
        return AgentResponse(
            agent="gst_tax_agent",
            summary=f"Could not parse Gemini response: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output=str(exc),
        )

    except Exception as exc:
        return AgentResponse(
            agent="gst_tax_agent",
            summary=f"Agent error: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output="",
        )

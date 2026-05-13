"""Compliance Agent — tracks GST deadlines, generates checklists, drafts replies to notices."""

import json
from datetime import date

from models.schemas import AgentResponse
from utils.gemini_client import call_gemini, AgentTimeoutError, AgentParseError

# ── System prompt (exact, from Agent Prompts page) ───────────────────────────

COMPLIANCE_SYSTEM_PROMPT = """You are a GST compliance officer for an Indian SME.
Given the following notice details and the current date, generate:
1. A complete action checklist with deadlines
2. A draft reply letter to the GST department (formal, in English)
3. A list of documents the business needs to gather
4. Upcoming GST filing deadlines for the next 30 days (GSTR-1, GSTR-3B, etc.) based on today's date

Return JSON:
{
  "action_checklist": [{"task": string, "deadline": date, "priority": "high"|"medium"|"low"}],
  "draft_reply": string,
  "documents_needed": [string],
  "upcoming_deadlines": [{"form": string, "due_date": date, "description": string}]
}"""


def _earliest_deadline(checklist: list[dict]) -> str:
    """Return the earliest ISO deadline string from the action checklist, or 'N/A'."""
    deadlines = [item.get("deadline", "") for item in checklist if item.get("deadline")]
    return min(deadlines) if deadlines else "N/A"


# ── Agent entry point ─────────────────────────────────────────────────────────

def run(gst_agent_output: AgentResponse) -> AgentResponse:
    """Generate compliance checklist, draft reply, and upcoming deadlines from GST agent output."""
    today_iso = date.today().isoformat()

    prompt = (
        COMPLIANCE_SYSTEM_PROMPT
        + "\n\nNotice details:\n"
        + json.dumps(gst_agent_output.structured_data)
        + "\n\nToday's date: "
        + today_iso
        + "\nRespond ONLY with valid JSON."
    )

    try:
        parsed = call_gemini(prompt, expect_json=True, agent="compliance_agent")

        checklist = parsed.get("action_checklist", [])
        earliest = _earliest_deadline(checklist)

        summary = (
            f"{len(checklist)} action items. "
            f"Next deadline: {earliest}"
        )
        action_items = [item["task"] for item in checklist if "task" in item]

        return AgentResponse(
            agent="compliance_agent",
            summary=summary,
            structured_data=parsed,
            action_items=action_items,
            confidence=0.9,
            raw_llm_output=json.dumps(parsed),
        )

    except AgentTimeoutError as exc:
        return AgentResponse(
            agent="compliance_agent",
            summary=f"Request timed out: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output="",
        )

    except AgentParseError as exc:
        return AgentResponse(
            agent="compliance_agent",
            summary=f"Could not parse Gemini response: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output=str(exc),
        )

    except Exception as exc:
        return AgentResponse(
            agent="compliance_agent",
            summary=f"Agent error: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output="",
        )

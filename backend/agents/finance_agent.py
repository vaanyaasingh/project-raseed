"""Finance Agent — cash flow analysis and anomaly detection over bank/ledger data."""

import json
from datetime import date

import pandas as pd

from models.schemas import AgentResponse
from utils.gemini_client import call_gemini, AgentTimeoutError, AgentParseError

# ── System prompt (exact, from Agent Prompts page) ───────────────────────────

FINANCE_SYSTEM_PROMPT = """You are a financial analyst for an Indian SME.
You will be given a list of bank transactions in JSON format.

Your job is to:
1. Summarize cash flow: total inflow, total outflow, net for the period
2. Identify the top 5 expense categories
3. Flag any anomalies: unusually large transactions, repeated round-number payments, gaps in activity, duplicate amounts
4. Give a simple financial health score from 1-10 with a one-line reason
5. Identify if any transactions look like GST-related payments or refunds

Return JSON:
{
  "period": {"start": date, "end": date},
  "total_inflow": number,
  "total_outflow": number,
  "net": number,
  "top_expense_categories": [{"category": string, "amount": number}],
  "anomalies": [{"date": date, "amount": number, "reason": string}],
  "health_score": number,
  "health_reason": string,
  "gst_related_transactions": [{"date": date, "amount": number, "description": string}]
}"""

_MAX_ROWS = 500


def run(df: pd.DataFrame) -> AgentResponse:
    """Analyse a bank statement DataFrame and return a structured AgentResponse."""

    # ── Cap to most recent 500 rows ───────────────────────────────────────────
    if len(df) > _MAX_ROWS:
        df = (
            df.sort_values("date", ascending=True)
            .tail(_MAX_ROWS)
            .reset_index(drop=True)
        )

    today_iso = date.today().isoformat()
    df_json = df.to_json(orient="records")

    prompt = (
        FINANCE_SYSTEM_PROMPT
        + "\n\nTransactions:\n"
        + df_json
        + "\n\nToday's date: "
        + today_iso
        + "\n\nRespond ONLY with valid JSON."
    )

    try:
        parsed = call_gemini(prompt, expect_json=True, agent="finance_agent")

        summary = (
            f"Net cash flow: {parsed.get('net', 'N/A')}. "
            f"Health score: {parsed.get('health_score', 'N/A')}/10 "
            f"— {parsed.get('health_reason', '')}"
        )
        action_items = [
            f"Review anomaly: {a['reason']}"
            for a in parsed.get("anomalies", [])
        ]

        return AgentResponse(
            agent="finance_agent",
            summary=summary,
            structured_data=parsed,
            action_items=action_items,
            confidence=0.85,
            raw_llm_output=json.dumps(parsed),
        )

    except AgentTimeoutError as exc:
        return AgentResponse(
            agent="finance_agent",
            summary=f"Request timed out: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output="",
        )

    except AgentParseError as exc:
        return AgentResponse(
            agent="finance_agent",
            summary=f"Could not parse Gemini response: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output=str(exc),
        )

    except Exception as exc:
        return AgentResponse(
            agent="finance_agent",
            summary=f"Agent error: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output="",
        )

"""Communication Agent — drafts emails only. Sending requires explicit frontend confirmation."""

import json
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv

from models.schemas import AgentResponse
from utils.gemini_client import call_gemini, AgentTimeoutError, AgentParseError

load_dotenv()

# ── System prompt (exact, from Agent Prompts page) ───────────────────────────

COMMUNICATION_SYSTEM_PROMPT = """You are a professional business communication assistant for an Indian SME.
Draft a concise, polite email for the following purpose.
The tone should be professional but friendly. Keep it under 150 words.
Return JSON:
{
  "subject": string,
  "body": string,
  "recipient_hint": string
}"""


# ── Function 1: Draft (AI only, never sends) ─────────────────────────────────

def draft_email(purpose: str, context: dict) -> AgentResponse:
    """
    Draft an email for the given purpose using Gemini. Never sends.

    Args:
        purpose:  e.g. "send invoice", "payment reminder", "follow up on overdue payment"
        context:  dict with relevant details — invoice_number, amount, recipient, due_date, etc.
    """
    prompt = (
        COMMUNICATION_SYSTEM_PROMPT
        + "\n\nPurpose: "
        + purpose
        + "\n\nContext:\n"
        + json.dumps(context, indent=2)
        + "\n\nRespond ONLY with valid JSON."
    )

    try:
        parsed = call_gemini(prompt, expect_json=True, agent="communication_agent")

        return AgentResponse(
            agent="communication_agent",
            summary="Email draft ready for your review. Please confirm before sending.",
            structured_data=parsed,
            action_items=["Review the draft email and confirm before sending."],
            confidence=0.9,
            raw_llm_output=json.dumps(parsed),
        )

    except AgentTimeoutError as exc:
        return AgentResponse(
            agent="communication_agent",
            summary=f"Request timed out: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output="",
        )

    except AgentParseError as exc:
        return AgentResponse(
            agent="communication_agent",
            summary=f"Could not parse Gemini response: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output=str(exc),
        )

    except Exception as exc:
        return AgentResponse(
            agent="communication_agent",
            summary=f"Agent error: {exc}",
            structured_data={},
            action_items=[],
            confidence=0.0,
            raw_llm_output="",
        )


# ── Function 2: Send (ONLY called after frontend confirmation) ────────────────

def send_email(to: str, subject: str, body: str) -> bool:
    """
    Send an email via SMTP with TLS.

    IMPORTANT: this function must only be called from the /invoices/send endpoint
    after the user has explicitly confirmed the draft in the frontend modal.

    Returns True on success, False on any failure.
    """
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")

    if not smtp_user or not smtp_password:
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_user
        msg["To"] = to
        msg.attach(MIMEText(body, "plain"))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, to, msg.as_string())

        return True

    except Exception:
        return False

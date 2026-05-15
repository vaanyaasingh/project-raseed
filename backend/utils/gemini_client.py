"""Gemini API wrapper — handles JSON generation, parse retry, and 90-second timeout."""

import json
import os
import uuid
import re
import time

from dotenv import load_dotenv
from google import genai

load_dotenv()

_MODEL = "gemini-2.5-flash"
_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set in environment")
        _client = genai.Client(api_key=api_key)
    return _client


# ── Custom exceptions ────────────────────────────────────────────────────────

class AgentTimeoutError(Exception):
    pass


class AgentParseError(Exception):
    pass


# ── Logging helper ───────────────────────────────────────────────────────────

def _log(agent: str, input_summary: str, raw_output: str, parsed_output: str, success: bool, error: str = "") -> None:
    try:
        from db.supabase_client import supabase
        supabase.table("agent_logs").insert({
            "id": str(uuid.uuid4()),
            "agent": agent,
            "input_summary": input_summary,
            "raw_llm_output": raw_output,
            "parsed_output": parsed_output,
            "success": success,
            "error_message": error,
        }).execute()
    except Exception:
        pass  # never crash the caller because of a logging failure


def _strip_json_fences(text: str) -> str:
    """Remove markdown code fences that Gemini sometimes wraps JSON in."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


# ── Main entry point ─────────────────────────────────────────────────────────

def call_gemini(prompt: str, expect_json: bool = True, agent: str = "gemini_client") -> dict | str:
    """
    Call Gemini and return a parsed dict (expect_json=True) or raw string.

    Raises:
        AgentTimeoutError  — if the API call takes longer than 90 seconds
        AgentParseError    — if JSON parsing fails after one retry
    """
    import signal

    client = _get_client()
    input_summary = prompt[:200]
    timeout_secs = 90  # compliance agent generates large structured output; 30s was too tight

    def _timeout_handler(signum, frame):
        raise AgentTimeoutError(f"LLM call exceeded {timeout_secs} seconds")

    def _call(p: str) -> str:
        # Use SIGALRM for a hard wall-clock timeout (Unix only).
        # Retry up to 3 times on 429 rate-limit errors with exponential backoff.
        max_retries = 3
        for attempt in range(max_retries):
            signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(timeout_secs)
            try:
                response = client.models.generate_content(model=_MODEL, contents=p)
                return response.text
            except Exception as exc:
                signal.alarm(0)
                err_str = str(exc)
                if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                    if attempt < max_retries - 1:
                        wait = 60 * (attempt + 1)  # 60s, 120s
                        time.sleep(wait)
                        continue
                raise
            finally:
                signal.alarm(0)

    # ── First attempt ────────────────────────────────────────────────────────
    try:
        raw = _call(prompt)
    except AgentTimeoutError:
        _log(agent, input_summary, "", "", False, f"LLM call exceeded {timeout_secs} seconds")
        raise

    if not expect_json:
        _log(agent, input_summary, raw, "", True)
        return raw

    # ── JSON parse, retry once ───────────────────────────────────────────────
    try:
        result = json.loads(_strip_json_fences(raw))
        _log(agent, input_summary, raw, json.dumps(result), True)
        return result
    except (json.JSONDecodeError, ValueError):
        pass  # fall through to retry

    retry_prompt = (
        prompt
        + "\n\nCRITICAL: Return ONLY valid JSON. No markdown, no backticks, no explanation."
    )
    try:
        raw2 = _call(retry_prompt)
        result = json.loads(_strip_json_fences(raw2))
        _log(agent, input_summary, raw2, json.dumps(result), True)
        return result
    except AgentTimeoutError:
        _log(agent, input_summary, "", "", False, f"LLM call exceeded {timeout_secs} seconds (retry)")
        raise
    except (json.JSONDecodeError, ValueError) as exc:
        _log(agent, input_summary, raw, "", False, str(exc))
        raise AgentParseError(
            f"Gemini returned invalid JSON after retry. Raw output: {raw[:300]}"
        ) from exc


# ── Quick smoke-test ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Testing Gemini client...")

    result = call_gemini(
        'Return a JSON object with keys "status" and "message". '
        'status should be "ok" and message should be "Gemini is working".',
        expect_json=True,
        agent="smoke_test",
    )
    print("JSON response:", result)

    text = call_gemini(
        "In one sentence, what is GST in India?",
        expect_json=False,
        agent="smoke_test",
    )
    print("Text response:", text)

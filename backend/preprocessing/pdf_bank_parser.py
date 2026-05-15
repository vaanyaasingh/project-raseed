"""Parse a bank statement PDF by extracting text then using Gemini to pull transactions."""

import json
import pandas as pd
import numpy as np

from preprocessing.pdf_extractor import extract_text
from utils.gemini_client import call_gemini


_PROMPT = """You are a bank statement parser for Indian banks.
Extract every transaction from the following bank statement text.

Return a JSON array where each element is an object with these fields:
{
  "date": "YYYY-MM-DD",
  "description": "narration / transaction description",
  "debit": 0.0,
  "credit": 0.0,
  "balance": 0.0
}

Rules:
- debit = amount going OUT of the account (withdrawal). Use 0 if not applicable.
- credit = amount coming IN to the account (deposit). Use 0 if not applicable.
- balance = running balance after the transaction. Use 0 if not shown.
- All amounts in INR as plain numbers (no commas, no symbols).
- Date must be ISO format YYYY-MM-DD. If only month/year shown, use the 1st of the month.
- Skip header rows, summary rows, and opening/closing balance lines.
- Return ONLY the JSON array, no markdown, no explanation.

Bank statement text:
"""


def parse_bank_statement_pdf(filepath: str) -> tuple[pd.DataFrame, dict]:
    """
    Extract transactions from a bank statement PDF using OCR + Gemini.

    Returns:
        (df, summary) — same shape as parse_bank_statement() for CSV files.
    Raises:
        ValueError — if text extraction or parsing fails.
    """
    # 1. Extract text from PDF
    raw_text, method = extract_text(filepath)
    if not raw_text.strip():
        raise ValueError("Could not extract text from the PDF. Try a higher-quality scan.")

    # Truncate to avoid token limits (~12k chars ≈ 3k tokens, well within limits)
    text_slice = raw_text[:12_000]

    # 2. Call Gemini to parse transactions
    prompt = _PROMPT + text_slice + "\n\nReturn ONLY valid JSON array."
    raw = call_gemini(prompt, expect_json=True, agent="pdf_bank_parser")

    # Gemini may return a dict with a key, or a list directly
    if isinstance(raw, dict):
        # Try common wrapper keys
        for key in ("transactions", "data", "rows", "items"):
            if key in raw and isinstance(raw[key], list):
                raw = raw[key]
                break
        else:
            raise ValueError(f"Gemini returned a dict without a transaction list: {list(raw.keys())}")

    if not isinstance(raw, list) or len(raw) == 0:
        raise ValueError("Gemini could not find any transactions in this PDF.")

    # 3. Build normalised DataFrame
    rows = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        rows.append({
            "date":        str(item.get("date") or ""),
            "description": str(item.get("description") or ""),
            "debit":       float(item.get("debit") or 0),
            "credit":      float(item.get("credit") or 0),
            "balance":     float(item.get("balance") or 0),
        })

    if not rows:
        raise ValueError("No valid transaction rows found after parsing.")

    df = pd.DataFrame(rows)
    df = df[~((df["debit"] == 0) & (df["credit"] == 0))].reset_index(drop=True)

    if df.empty:
        raise ValueError("All transactions had zero debit and credit — nothing to analyse.")

    df["type"]       = np.where(df["credit"] > 0, "credit", "debit")
    df["net_amount"] = np.where(df["credit"] > 0, df["credit"], -df["debit"])
    df["amount"]     = np.where(df["credit"] > 0, df["credit"], df["debit"])

    df = df.sort_values("date").reset_index(drop=True)

    valid_dates = df["date"].replace("", pd.NA).dropna()
    summary = {
        "total_rows":    len(df),
        "date_range":    {
            "start": valid_dates.min() if not valid_dates.empty else None,
            "end":   valid_dates.max() if not valid_dates.empty else None,
        },
        "total_credits": round(float(df["credit"].sum()), 2),
        "total_debits":  round(float(df["debit"].sum()), 2),
        "extraction_method": method,
    }

    return df, summary

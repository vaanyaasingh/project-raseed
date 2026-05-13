"""Bank statement CSV normalizer — handles common Indian bank column formats and returns a clean DataFrame."""

import re
import pandas as pd
import numpy as np

# ── Column name candidates ────────────────────────────────────────────────────

_COL_CANDIDATES: dict[str, list[str]] = {
    "date":        ["date", "txn date", "value date", "transaction date", "posting date"],
    "description": ["description", "narration", "particulars", "remarks", "details"],
    "debit":       ["debit", "withdrawal", "dr", "debit amount", "withdrawal amount"],
    "credit":      ["credit", "deposit", "cr", "credit amount", "deposit amount"],
    "balance":     ["balance", "closing balance", "running balance", "available balance"],
}


def _find_col(df: pd.DataFrame, role: str) -> str | None:
    """Return the first column in df whose normalised name matches a candidate."""
    normalised = {col.strip().lower(): col for col in df.columns}
    for candidate in _COL_CANDIDATES[role]:
        if candidate in normalised:
            return normalised[candidate]
    return None


# ── Amount cleaning ───────────────────────────────────────────────────────────

def _to_float(series: pd.Series) -> pd.Series:
    """Strip currency symbols, commas, whitespace; coerce to float; NaN → 0.0."""
    cleaned = (
        series.astype(str)
        .str.replace(r"[₹$€£,\s]", "", regex=True)
        .str.replace(r"[()]", "", regex=True)   # some banks use (123.45) for negatives
        .str.strip()
        .replace({"": "0", "-": "0", "nan": "0", "None": "0"})
    )
    return pd.to_numeric(cleaned, errors="coerce").fillna(0.0)


# ── Date parsing ──────────────────────────────────────────────────────────────

_DATE_FORMATS = [
    "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y", "%d-%b-%Y",
    "%d/%m/%y", "%d-%m-%y",
    "%Y-%m-%d", "%Y/%m/%d",
    "%d %B %Y",
]


def _parse_dates(series: pd.Series) -> pd.Series:
    """Try multiple date formats and return ISO-format strings."""
    # First pass: try each format on the whole series (fast path for uniform formats)
    for fmt in _DATE_FORMATS:
        parsed = pd.to_datetime(series, format=fmt, errors="coerce")
        if parsed.notna().sum() >= len(series) * 0.8:  # ≥80% parsed → accept
            return parsed.dt.strftime("%Y-%m-%d")

    # Second pass: parse each value individually with the best-matching format
    def _parse_one(val: str) -> str | None:
        val = str(val).strip()
        for fmt in _DATE_FORMATS:
            try:
                return pd.to_datetime(val, format=fmt).strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                continue
        # Last resort: let pandas guess
        try:
            return pd.to_datetime(val, dayfirst=True).strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            return None

    result = series.map(_parse_one)
    if result.isna().all():
        raise ValueError("Could not parse any dates in the date column.")
    return result


# ── Main parser ───────────────────────────────────────────────────────────────

def parse_bank_statement(filepath: str) -> tuple[pd.DataFrame, dict]:
    """
    Parse an Indian bank statement CSV and return a normalised DataFrame plus summary.

    Returns:
        (df, summary) where summary has keys:
            total_rows, date_range {start, end}, total_credits, total_debits

    Raises:
        ValueError — with a descriptive message if the file cannot be parsed.
    """
    # ── Load ──────────────────────────────────────────────────────────────────
    try:
        # Try skipping rows that look like bank headers (non-CSV junk at top)
        raw = pd.read_csv(filepath, header=None, dtype=str, keep_default_na=False)
    except Exception as exc:
        raise ValueError(f"Could not read CSV file '{filepath}': {exc}") from exc

    # Find the header row: the row with the most non-empty cells that contains
    # at least one recognised column name.
    header_idx = 0
    for i, row in raw.iterrows():
        row_lower = " ".join(row.astype(str).str.lower().tolist())
        if any(c in row_lower for c in ["date", "narration", "debit", "credit", "balance", "description", "particulars"]):
            header_idx = i
            break

    df = pd.read_csv(filepath, header=header_idx, dtype=str, keep_default_na=False)
    df.columns = df.columns.str.strip()

    # ── Detect required columns ───────────────────────────────────────────────
    date_col   = _find_col(df, "date")
    desc_col   = _find_col(df, "description")
    debit_col  = _find_col(df, "debit")
    credit_col = _find_col(df, "credit")

    missing = [role for role, col in [("date", date_col), ("description", desc_col),
                                       ("debit", debit_col), ("credit", credit_col)]
               if col is None]
    if missing:
        raise ValueError(
            f"Could not find columns for: {missing}. "
            f"Detected columns were: {list(df.columns)}"
        )

    # ── Build normalised frame ────────────────────────────────────────────────
    out = pd.DataFrame()
    out["date"]        = _parse_dates(df[date_col])
    out["description"] = df[desc_col].str.strip()
    out["debit"]       = _to_float(df[debit_col])
    out["credit"]      = _to_float(df[credit_col])

    balance_col = _find_col(df, "balance")
    out["balance"] = _to_float(df[balance_col]) if balance_col else np.nan

    # ── Derived columns ───────────────────────────────────────────────────────
    out["type"]       = np.where(out["credit"] > 0, "credit", "debit")
    out["net_amount"] = np.where(out["credit"] > 0, out["credit"], -out["debit"])

    # ── Drop duplicates & rows with no activity ───────────────────────────────
    out = out.drop_duplicates()
    out = out[~((out["debit"] == 0) & (out["credit"] == 0))].reset_index(drop=True)

    if out.empty:
        raise ValueError("Bank statement parsed but contains no transaction rows.")

    # ── Sort by date ──────────────────────────────────────────────────────────
    out = out.sort_values("date").reset_index(drop=True)

    # ── Summary ───────────────────────────────────────────────────────────────
    valid_dates = out["date"].dropna()
    summary = {
        "total_rows":    len(out),
        "date_range":    {
            "start": valid_dates.min() if not valid_dates.empty else None,
            "end":   valid_dates.max() if not valid_dates.empty else None,
        },
        "total_credits": round(float(out["credit"].sum()), 2),
        "total_debits":  round(float(out["debit"].sum()), 2),
    }

    return out, summary

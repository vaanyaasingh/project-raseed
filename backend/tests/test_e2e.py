"""
End-to-end agent tests for Project Raseed.
Run from backend/: python tests/test_e2e.py

Requires GEMINI_API_KEY in backend/.env
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import pandas as pd
from models.schemas import DocumentInput
from agents.gst_tax_agent import run as gst_run
from agents.finance_agent import run as finance_run
from agents.compliance_agent import run as compliance_run

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
_results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = PASS if condition else FAIL
    print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))
    _results.append(condition)


# ── Test 1: GST Tax Agent ────────────────────────────────────────────────────

print("\n── Test 1: GST Tax Agent ──────────────────────────────────────────")

MOCK_NOTICE = """
FORM GST ASMT-10
Reference No.: ZA290526017063T   Date: 13/05/2026

To: M/s Sharma Electricals, GSTIN: 27AAACP1234N1Z5, Jaipur

Subject: Notice for Scrutiny of Return under Section 61 of CGST Act, 2017

Discrepancy: GSTR-1 vs GSTR-3B mismatch for Q3 FY2025-26 (Oct-Dec 2025).
Outward supplies in GSTR-1: Rs. 8,42,500
Outward supplies in GSTR-3B: Rs. 7,95,000
Difference: Rs. 47,500 — tax liability Rs. 8,550

You must file a reply on the GST portal within 30 days i.e. by 12/06/2026.
Failure to respond may attract penalty under Section 125 of CGST Act, 2017.
"""

gst_result = gst_run(DocumentInput(
    raw_text=MOCK_NOTICE,
    doc_type="gst_notice",
    filename="asmt10_test.pdf",
))

check("agent == 'gst_tax_agent'", gst_result.agent == "gst_tax_agent")
check("confidence > 0", gst_result.confidence > 0,
      f"confidence={gst_result.confidence} (check GEMINI_API_KEY if 0.0)")
check("structured_data has notice_type", "notice_type" in gst_result.structured_data)
check("structured_data has reason",      "reason"      in gst_result.structured_data)
check("structured_data has deadline",    "deadline"    in gst_result.structured_data)
check("action_items is a non-empty list",
      isinstance(gst_result.action_items, list) and len(gst_result.action_items) > 0)
check("summary is non-empty", bool(gst_result.summary))

print(f"\n  notice_type : {gst_result.structured_data.get('notice_type')}")
print(f"  deadline    : {gst_result.structured_data.get('deadline')}")
print(f"  summary     : {gst_result.summary[:120]}")


# ── Test 2: Finance Agent ────────────────────────────────────────────────────

print("\n── Test 2: Finance Agent ──────────────────────────────────────────")

MOCK_TRANSACTIONS = pd.DataFrame([
    {"date": "2025-10-03", "description": "NEFT - client payment",      "debit": 0,      "credit": 45000,  "type": "credit", "net_amount":  45000},
    {"date": "2025-10-05", "description": "Supplier payment",           "debit": 28500,  "credit": 0,      "type": "debit",  "net_amount": -28500},
    {"date": "2025-10-08", "description": "GST payment CPIN 251008",    "debit": 8250,   "credit": 0,      "type": "debit",  "net_amount":  -8250},
    {"date": "2025-10-10", "description": "Rent payment",               "debit": 15000,  "credit": 0,      "type": "debit",  "net_amount": -15000},
    {"date": "2025-11-01", "description": "RTGS - large client",        "debit": 0,      "credit": 95000,  "type": "credit", "net_amount":  95000},
    {"date": "2025-11-04", "description": "Supplier payment ABC",       "debit": 23625,  "credit": 0,      "type": "debit",  "net_amount": -23625},
    {"date": "2025-11-15", "description": "Salary credit Nov",          "debit": 42000,  "credit": 0,      "type": "debit",  "net_amount": -42000},
    {"date": "2025-12-01", "description": "NEFT - Tirumala Foods",      "debit": 0,      "credit": 48600,  "type": "credit", "net_amount":  48600},
    {"date": "2025-12-10", "description": "Rent payment",               "debit": 15000,  "credit": 0,      "type": "debit",  "net_amount": -15000},
    {"date": "2025-12-28", "description": "Year-end stock purchase",    "debit": 55000,  "credit": 0,      "type": "debit",  "net_amount": -55000},
])

finance_result = finance_run(MOCK_TRANSACTIONS)

check("agent == 'finance_agent'", finance_result.agent == "finance_agent")
check("confidence > 0", finance_result.confidence > 0,
      f"confidence={finance_result.confidence}")
check("structured_data has total_inflow",  "total_inflow"  in finance_result.structured_data)
check("structured_data has total_outflow", "total_outflow" in finance_result.structured_data)
check("structured_data has health_score",  "health_score"  in finance_result.structured_data)
check("structured_data has anomalies",     "anomalies"     in finance_result.structured_data)
check("summary is non-empty", bool(finance_result.summary))

print(f"\n  health_score : {finance_result.structured_data.get('health_score')}")
print(f"  net          : {finance_result.structured_data.get('net')}")
print(f"  anomalies    : {finance_result.structured_data.get('anomalies', [])}")
print(f"  summary      : {finance_result.summary[:120]}")


# ── Test 3: Compliance Agent ─────────────────────────────────────────────────

print("\n── Test 3: Compliance Agent ───────────────────────────────────────")

compliance_result = compliance_run(gst_result)

check("agent == 'compliance_agent'", compliance_result.agent == "compliance_agent")
check("confidence > 0", compliance_result.confidence > 0,
      f"confidence={compliance_result.confidence}")
check("structured_data has action_checklist",  "action_checklist"  in compliance_result.structured_data)
check("structured_data has draft_reply",       "draft_reply"       in compliance_result.structured_data)
check("structured_data has upcoming_deadlines","upcoming_deadlines" in compliance_result.structured_data)
check("action_items non-empty",
      isinstance(compliance_result.action_items, list) and len(compliance_result.action_items) > 0)

print(f"\n  summary      : {compliance_result.summary}")
print(f"  action_items : {compliance_result.action_items[:2]}")


# ── Summary ──────────────────────────────────────────────────────────────────

total  = len(_results)
passed = sum(_results)
failed = total - passed

print(f"\n{'─'*60}")
print(f"Results: {passed}/{total} passed", end="  ")
if failed == 0:
    print(f"\033[92m✓ All tests passed — safe to proceed to API layer.\033[0m")
else:
    print(f"\033[91m✗ {failed} test(s) failed — fix agents before building routers.\033[0m")
    sys.exit(1)

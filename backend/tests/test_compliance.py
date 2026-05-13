"""
Standalone compliance agent test.
Run from backend/: python tests/test_compliance.py

Requires GEMINI_API_KEY in backend/.env
"""

import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from models.schemas import DocumentInput
from agents.gst_tax_agent import run as gst_run
from agents.compliance_agent import run as compliance_run

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"

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


def check(name: str, condition: bool, detail: str = "") -> bool:
    status = PASS if condition else FAIL
    print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))
    return condition


results = []

# ── Step 1: GST agent (fast) ────────────────────────────────────────────────

print("\n── Step 1: GST Tax Agent (provides input to compliance agent) ─────")
t0 = time.time()
gst_result = gst_run(DocumentInput(
    raw_text=MOCK_NOTICE,
    doc_type="gst_notice",
    filename="asmt10_test.pdf",
))
print(f"  Done in {time.time() - t0:.1f}s  confidence={gst_result.confidence}")
print(f"  notice_type : {gst_result.structured_data.get('notice_type')}")
print(f"  deadline    : {gst_result.structured_data.get('deadline')}")

if gst_result.confidence == 0.0:
    print(f"\n  \033[91mGST agent failed: {gst_result.summary}\033[0m")
    print("  Cannot test compliance agent without GST output.")
    sys.exit(1)

# ── Step 2: Compliance agent ─────────────────────────────────────────────────

print("\n── Step 2: Compliance Agent ───────────────────────────────────────")
print("  (This agent generates a full draft reply + checklist — allow up to 90s)")
t0 = time.time()
comp_result = compliance_run(gst_result)
elapsed = time.time() - t0
print(f"  Done in {elapsed:.1f}s  confidence={comp_result.confidence}")

results.append(check("agent == 'compliance_agent'", comp_result.agent == "compliance_agent"))
results.append(check("confidence > 0", comp_result.confidence > 0,
    f"confidence={comp_result.confidence} — if 0.0 check GEMINI_API_KEY or timeout"))
results.append(check("has action_checklist",  "action_checklist"   in comp_result.structured_data))
results.append(check("has draft_reply",        "draft_reply"        in comp_result.structured_data))
results.append(check("has upcoming_deadlines", "upcoming_deadlines" in comp_result.structured_data))
results.append(check("action_items non-empty",
    isinstance(comp_result.action_items, list) and len(comp_result.action_items) > 0))

print(f"\n  summary      : {comp_result.summary}")
print(f"  action_items : {comp_result.action_items[:2]}")

checklist = comp_result.structured_data.get("action_checklist", [])
if checklist:
    print(f"\n  Checklist ({len(checklist)} items):")
    for item in checklist[:3]:
        print(f"    • [{item.get('priority','?').upper()}] {item.get('task')} — {item.get('deadline')}")

draft = comp_result.structured_data.get("draft_reply", "")
if draft:
    print(f"\n  Draft reply (first 200 chars):\n  {draft[:200]}")

deadlines = comp_result.structured_data.get("upcoming_deadlines", [])
if deadlines:
    print(f"\n  Upcoming deadlines ({len(deadlines)} found):")
    for d in deadlines[:3]:
        print(f"    • {d.get('form')} — {d.get('due_date')} — {d.get('description','')}")

# ── Summary ───────────────────────────────────────────────────────────────────

passed = sum(results)
total  = len(results)
failed = total - passed

print(f"\n{'─'*60}")
print(f"Results: {passed}/{total} passed", end="  ")
if failed == 0:
    print(f"\033[92m✓ Compliance agent working — safe to run full e2e suite.\033[0m")
else:
    print(f"\033[91m✗ {failed} test(s) failed.\033[0m")
    sys.exit(1)

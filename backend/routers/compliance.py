"""Compliance router — GST filing deadline calculator."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/compliance", tags=["compliance"])

# Standard GST filing deadlines (day-of-month for each form)
_DEADLINES = [
    {"form": "GSTR-1",  "day": 11, "description": "Outward supplies return (monthly filers)"},
    {"form": "GSTR-2B", "day": 14, "description": "Auto-drafted ITC statement (read-only)"},
    {"form": "GSTR-3B", "day": 20, "description": "Monthly summary return and tax payment"},
]


def _next_occurrence(day: int, from_date: date) -> date:
    """
    Return the next calendar date whose day-of-month is `day`.
    If that day in the current month is still in the future, return it;
    otherwise return the same day next month.
    """
    # Try current month first
    try:
        candidate = from_date.replace(day=day)
    except ValueError:
        # day doesn't exist in this month (e.g. day=31 in April) — go to next month
        candidate = None

    if candidate and candidate > from_date:
        return candidate

    # Advance to first day of next month, then set the day
    if from_date.month == 12:
        first_next = date(from_date.year + 1, 1, 1)
    else:
        first_next = date(from_date.year, from_date.month + 1, 1)

    try:
        return first_next.replace(day=day)
    except ValueError:
        # day doesn't exist next month either — clamp to last day of that month
        if first_next.month == 12:
            last_day = date(first_next.year + 1, 1, 1) - timedelta(days=1)
        else:
            last_day = date(first_next.year, first_next.month + 1, 1) - timedelta(days=1)
        return last_day


# ── GET /api/v1/compliance/deadlines ─────────────────────────────────────────

@router.get("/deadlines")
async def get_deadlines(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """
    Return all standard GST filing deadlines due within the next 30 days.
    Dates are computed relative to today — no DB query required.
    """
    today = date.today()
    window_end = today + timedelta(days=30)

    upcoming = []
    for spec in _DEADLINES:
        due = _next_occurrence(spec["day"], today)
        days_remaining = (due - today).days

        # Always include deadlines ≤ 30 days out; also include any already
        # in the current month that haven't passed (catches edge cases where
        # the filing window spans the month boundary)
        if due <= window_end:
            urgency = (
                "overdue"   if days_remaining < 0  else
                "urgent"    if days_remaining <= 3 else
                "soon"      if days_remaining <= 7 else
                "upcoming"
            )
            upcoming.append({
                "form":           spec["form"],
                "description":    spec["description"],
                "due_date":       due.isoformat(),
                "days_remaining": days_remaining,
                "urgency":        urgency,
            })

    return {
        "as_of":    today.isoformat(),
        "deadlines": upcoming,
    }

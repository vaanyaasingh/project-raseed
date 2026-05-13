"""Compliance router — /api/v1/compliance/* endpoints for deadlines, checklists, and draft replies."""

from fastapi import APIRouter

from agents.compliance_agent import ComplianceAgent

router = APIRouter(prefix="/api/v1/compliance", tags=["compliance"])

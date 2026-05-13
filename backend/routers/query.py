"""Query router — GST notice analysis, finance analysis, integrated cross-domain query, and freeform Q&A."""

from fastapi import APIRouter

from agents.orchestrator import orchestrate
from db.database import get_db
from models.schemas import GSTQueryRequest, FinanceQueryRequest, IntegratedQueryRequest, AskRequest

router = APIRouter(prefix="/api/v1/query", tags=["query"])

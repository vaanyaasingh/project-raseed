"""Project Raseed — FastAPI entry point."""

import traceback

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from db.database import init_db
from models.schemas import ErrorResponse
from routers.upload import router as upload_router
from routers.query import router as query_router
from routers.invoices import router as invoices_router
from routers.compliance import router as compliance_router
from routers.profile import router as profile_router

app = FastAPI(
    title="Raseed API",
    version="1.0.0",
    description="AI-powered GST and financial compliance copilot for Indian SMEs.",
)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(upload_router)
app.include_router(query_router)
app.include_router(invoices_router)
app.include_router(compliance_router)
app.include_router(profile_router)

# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup() -> None:
    init_db()

# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/")
async def health() -> dict:
    return {"status": "ok", "project": "Raseed"}

# ── Global exception handler ──────────────────────────────────────────────────

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            code="INTERNAL_ERROR",
            message="An unexpected error occurred.",
            detail=traceback.format_exc(limit=5),
        ).model_dump(),
    )

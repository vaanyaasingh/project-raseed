"""Project Raseed — FastAPI entry point."""

import traceback

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from models.schemas import ErrorResponse
from routers.upload import router as upload_router
from routers.query import router as query_router
from routers.invoices import router as invoices_router
from routers.compliance import router as compliance_router
from routers.users import router as users_router
from routers.chatbot import router as chatbot_router
from routers.chats import router as chats_router

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
app.include_router(users_router)
app.include_router(chatbot_router)
app.include_router(chats_router)

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

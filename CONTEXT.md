# Project Raseed — Claude Code Context

## What is this project?
Project Raseed is an AI-powered financial and compliance copilot for Indian SMEs.
It automates CA workflows: interpreting GST notices, managing invoices, analyzing
cash flow, and drafting compliance responses.
This is a hackathon production build. Prioritize working code over perfect code.

## Tech Stack
- Backend: Python, FastAPI, LangGraph
- AI: Gemini API (gemini-2.5-flash) via google-generativeai SDK
- Frontend: Next.js + Tailwind CSS
- Document processing: PyMuPDF (digital PDFs), Tesseract (scanned), pdfplumber (tables)
- Storage: SQLite (structured data), ChromaDB (vector/RAG)
- Financial analysis: Pandas, NumPy, scikit-learn

## Key files
- backend/main.py — FastAPI entry point
- backend/agents/orchestrator.py — MCP orchestrator, routes tasks to agents
- backend/agents/gst_tax_agent.py — GST notice interpreter
- backend/agents/finance_agent.py — Cash flow + anomaly detection
- backend/agents/invoice_agent.py — Invoice extraction and generation
- backend/agents/compliance_agent.py — Deadlines, checklists, draft replies
- backend/agents/communication_agent.py — Email automation (human-in-loop)
- backend/utils/gemini_client.py — Gemini API wrapper
- backend/db/database.py — SQLite schema and connection
- backend/db/vector_store.py — ChromaDB helpers
- frontend/lib/api.ts — All API calls to backend

## Environment variables
Backend (.env):
  GEMINI_API_KEY — from aistudio.google.com
  SQLITE_DB_PATH — ../raseed.db
  CHROMADB_PATH — ./chroma_store
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD — for email
Frontend (.env.local):
  NEXT_PUBLIC_API_URL — http://localhost:8000

## Gemini API usage pattern
from google import genai
import json

client = genai.Client()  # reads GEMINI_API_KEY from env

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=f"{system_prompt}\n\nInput:\n{user_input}\n\nRespond ONLY with valid JSON."
)

try:
    result = json.loads(response.text)
except json.JSONDecodeError:
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"{system_prompt}\n\nInput:\n{user_input}\n\nCRITICAL: Valid JSON only. No markdown, no backticks."
    )
    result = json.loads(response.text)

## Agent rules
- All agents return structured JSON, never plain text
- System prompts are constants at the top of each agent file
- All LLM calls have 30 second timeout
- If Gemini JSON parse fails: retry once with stricter prompt
- If OCR returns < 50 chars: return LOW_QUALITY_EXTRACT error
- Log all raw LLM output to agent_logs table in SQLite

## API base URL
http://localhost:8000/api/v1
Full schema in API Schema page on Notion.

## Human-in-the-loop rule
Communication Agent (email sending) must NOT execute without frontend confirmation.
Flow: AI drafts → frontend shows preview + confirm button → user confirms → POST /api/v1/invoices/send

## Indian GST context
- GST = CGST + SGST (intra-state) or IGST (inter-state)
- GSTR-1 due: 11th of next month (outward supplies)
- GSTR-3B due: 20th of next month (summary return)
- Common notices: ASMT-10 (scrutiny), DRC-01 (demand), GSTR-3A (non-filer)
- GSTIN: 15-character code starting with 2-digit state code
- All amounts in INR
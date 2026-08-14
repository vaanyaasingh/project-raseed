# Project Raseed

AI-powered GST and financial compliance copilot for Indian SMEs — automates notice interpretation, invoice processing, cash flow analysis, and compliance deadline tracking.

## Setup

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in SMTP + Supabase credentials
# Local dev without GCP credentials: set GOOGLE_GENAI_USE_VERTEXAI=false and GEMINI_API_KEY
# Prod / has gcloud ADC set up: leave GOOGLE_GENAI_USE_VERTEXAI unset (defaults to true) and set
#   GOOGLE_CLOUD_PROJECT (and optionally GOOGLE_CLOUD_LOCATION, defaults to us-central1)
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev                   # http://localhost:3000
```

### Prerequisites

- Python 3.11+
- Node.js 20+
- Tesseract OCR: `brew install tesseract` (macOS) / `apt install tesseract-ocr` (Linux)
- Gemini access: either `gcloud auth application-default login` (Vertex AI mode, prod default) or an API key from [aistudio.google.com](https://aistudio.google.com) (local-only fallback)

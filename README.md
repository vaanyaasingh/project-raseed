# Project Raseed

AI-powered GST and financial compliance copilot for Indian SMEs — automates notice interpretation, invoice processing, cash flow analysis, and compliance deadline tracking.

## Setup

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in GEMINI_API_KEY and SMTP credentials
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
- Gemini API key from [aistudio.google.com](https://aistudio.google.com)

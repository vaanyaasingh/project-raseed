"""PDF text extraction — PyMuPDF for digital PDFs, Tesseract OCR for scanned/image PDFs, pdfplumber for tables."""

import io
import re

import fitz  # PyMuPDF
import pdfplumber
import pytesseract
from PIL import Image

_MIN_CHARS = 50


def _clean(text: str) -> str:
    """Collapse runs of whitespace while preserving paragraph breaks."""
    # Normalise line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Collapse 3+ blank lines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Collapse horizontal whitespace (spaces/tabs) within each line
    text = "\n".join(re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n"))
    return text.strip()


# ── Strategy A — Digital PDF ─────────────────────────────────────────────────

def extract_text_pymupdf(filepath: str) -> str:
    """Extract text from a digital PDF using PyMuPDF."""
    pages = []
    with fitz.open(filepath) as doc:
        for page in doc:
            pages.append(page.get_text())
    return _clean("\n".join(pages))


# ── Strategy B — Scanned / Image PDF ────────────────────────────────────────

def extract_text_ocr(filepath: str) -> str:
    """OCR every page of a PDF via Tesseract after rendering to PIL Images."""
    pages = []
    with fitz.open(filepath) as doc:
        for page in doc:
            # Render at 2× zoom for better OCR accuracy
            mat = fitz.Matrix(2, 2)
            pix = page.get_pixmap(matrix=mat)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            text = pytesseract.image_to_string(img, lang="eng")
            pages.append(text)
    return _clean("\n".join(pages))


# ── Smart router ─────────────────────────────────────────────────────────────

def extract_text(filepath: str) -> tuple[str, str]:
    """
    Extract text from a PDF, choosing the best strategy automatically.

    Returns:
        (extracted_text, method_used) where method_used is "pymupdf" or "ocr"

    Raises:
        ValueError("LOW_QUALITY_EXTRACT") if both strategies yield < 50 chars.
    """
    text = extract_text_pymupdf(filepath)
    if len(text) >= _MIN_CHARS:
        return text, "pymupdf"

    text = extract_text_ocr(filepath)
    if len(text) >= _MIN_CHARS:
        return text, "ocr"

    raise ValueError("LOW_QUALITY_EXTRACT")


# ── Table extraction (invoices) ──────────────────────────────────────────────

def extract_table_from_invoice(filepath: str) -> list[dict]:
    """
    Extract tables from an invoice PDF using pdfplumber.

    Returns a flat list of row dicts built from the first header row found.
    Returns an empty list if no tables are found.
    """
    rows: list[dict] = []
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                if not table or len(table) < 2:
                    continue
                # First row is the header; skip empty / None headers
                header = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(table[0])]
                for row in table[1:]:
                    rows.append({
                        header[i]: (str(cell).strip() if cell is not None else "")
                        for i, cell in enumerate(row)
                    })
    return rows

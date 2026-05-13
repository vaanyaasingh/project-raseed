"""Tesseract OCR helpers for scanned/image-based documents. Returns LOW_QUALITY_EXTRACT if text < 50 chars."""

import pytesseract
from PIL import Image
import fitz  # PyMuPDF — used to render PDF pages to images before OCR

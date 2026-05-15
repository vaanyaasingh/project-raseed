"""OCR fallback — returns empty string when Tesseract is not available."""


def extract_text_ocr(filepath: str) -> str:
    try:
        import pytesseract
        from PIL import Image
        import fitz

        doc = fitz.open(filepath)
        texts = []
        for page in doc:
            pix = page.get_pixmap(dpi=200)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            texts.append(pytesseract.image_to_string(img))
        return "\n".join(texts)
    except Exception:
        return ""

"""GST-compliant invoice PDF generator using ReportLab.

Supports an optional letterhead image (PNG/JPG) or PDF (first page extracted)
that is placed as a full-width banner at the top of the invoice.
"""

from __future__ import annotations

import io
import os
import tempfile
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    Image,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# ── Design tokens (matches frontend CSS vars) ─────────────────────────────────

_PRIMARY = colors.HexColor("#4A7C59")
_INK     = colors.HexColor("#1A1D29")
_INK2    = colors.HexColor("#4A5065")
_INK3    = colors.HexColor("#8A8FA8")
_BORDER  = colors.HexColor("#E8E4DC")
_BG2     = colors.HexColor("#F5F1E8")
_WHITE   = colors.white

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


# ── Style helpers ─────────────────────────────────────────────────────────────

def _p(name: str, **kw) -> ParagraphStyle:
    s = ParagraphStyle(name)
    defaults = dict(fontName="Helvetica", fontSize=10, leading=14, textColor=_INK)
    defaults.update(kw)
    for k, v in defaults.items():
        setattr(s, k, v)
    return s


_STYLES = {
    "title":       _p("title",   fontName="Helvetica-Bold",  fontSize=22, textColor=_PRIMARY, leading=26),
    "inv_num":     _p("inv_num", fontName="Helvetica-Bold",  fontSize=11, textColor=_INK),
    "label":       _p("label",   fontName="Helvetica",       fontSize=8,  textColor=_INK3, leading=12),
    "value":       _p("value",   fontName="Helvetica-Bold",  fontSize=10, textColor=_INK,  leading=14),
    "body":        _p("body",    fontName="Helvetica",        fontSize=9,  textColor=_INK2, leading=13),
    "body_r":      _p("body_r",  fontName="Helvetica",        fontSize=9,  textColor=_INK2, leading=13, alignment=TA_RIGHT),
    "bold_r":      _p("bold_r",  fontName="Helvetica-Bold",  fontSize=9,  textColor=_INK,  leading=13, alignment=TA_RIGHT),
    "total_label": _p("total_l", fontName="Helvetica-Bold",  fontSize=11, textColor=_INK,  leading=16, alignment=TA_RIGHT),
    "total_val":   _p("total_v", fontName="Helvetica-Bold",  fontSize=13, textColor=_PRIMARY, leading=18, alignment=TA_RIGHT),
    "col_header":  _p("col_h",   fontName="Helvetica-Bold",  fontSize=8,  textColor=_WHITE, leading=12),
    "section":     _p("section", fontName="Helvetica-Bold",  fontSize=8,  textColor=_INK3, leading=12, spaceAfter=3),
    "footer":      _p("footer",  fontName="Helvetica",        fontSize=7,  textColor=_INK3, leading=10, alignment=TA_CENTER),
}


def _fmt_inr(val) -> str:
    try:
        n = float(val or 0)
        return f"₹{n:,.2f}"
    except (ValueError, TypeError):
        return "—"


def _para(text: str, style: str) -> Paragraph:
    return Paragraph(str(text or ""), _STYLES[style])


# ── Letterhead extraction ─────────────────────────────────────────────────────

def _letterhead_image(lh_bytes: bytes, lh_ext: str, max_height_mm: float = 45) -> Optional[Image]:
    """Convert letterhead bytes (PNG/JPG/PDF) to a ReportLab Image object."""
    ext = lh_ext.lower().lstrip(".")
    try:
        if ext == "pdf":
            import fitz
            doc = fitz.open(stream=lh_bytes, filetype="pdf")
            page = doc.load_page(0)
            mat = fitz.Matrix(2.0, 2.0)          # 2× for sharpness
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            doc.close()
        else:
            img_bytes = lh_bytes

        from PIL import Image as PILImage
        pil = PILImage.open(io.BytesIO(img_bytes))
        w_px, h_px = pil.size
        aspect = h_px / w_px

        draw_w = CONTENT_W
        draw_h = min(draw_w * aspect, max_height_mm * mm)
        if draw_w * aspect < draw_h:
            draw_h = draw_w * aspect

        rl_img = Image(io.BytesIO(img_bytes), width=draw_w, height=draw_h)
        return rl_img
    except Exception:
        return None


# ── Main generator ────────────────────────────────────────────────────────────

def generate_invoice_pdf(
    invoice_data: dict,
    profile: Optional[dict] = None,
    letterhead_bytes: Optional[bytes] = None,
    letterhead_ext: Optional[str] = None,
) -> bytes:
    """
    Generate a GST-compliant invoice PDF and return it as bytes.

    Args:
        invoice_data:     Structured invoice dict (from invoice_agent or generate endpoint).
        profile:          User profile dict with name, business_name, gstin, etc.
        letterhead_bytes: Raw bytes of uploaded letterhead file (optional).
        letterhead_ext:   Extension of letterhead file, e.g. "png", "pdf" (optional).
    """
    buf = io.BytesIO()
    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )
    frame = Frame(MARGIN, MARGIN, CONTENT_W, PAGE_H - 2 * MARGIN, id="main")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame])])

    story: list = []

    # ── 1. Letterhead ──────────────────────────────────────────────────────────
    if letterhead_bytes and letterhead_ext:
        lh_img = _letterhead_image(letterhead_bytes, letterhead_ext)
        if lh_img:
            story.append(lh_img)
            story.append(Spacer(1, 4 * mm))

    # ── 2. Header row: company info (left) + INVOICE title (right) ─────────────
    company_name    = invoice_data.get("vendor_name") or (profile or {}).get("business_name") or "—"
    company_gstin   = invoice_data.get("vendor_gstin") or (profile or {}).get("gstin") or ""
    invoice_number  = invoice_data.get("invoice_number") or "—"
    invoice_date    = invoice_data.get("invoice_date") or "—"
    due_date        = invoice_data.get("payment_due_date") or ""
    invoice_type    = (invoice_data.get("invoice_type") or "issued").upper()

    header_data = [[
        # Left cell: company block
        Table(
            [
                [_para(company_name, "inv_num")],
                [_para(company_gstin and f"GSTIN: {company_gstin}" or "", "body")],
            ],
            colWidths=[CONTENT_W * 0.6],
            style=TableStyle([("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 0), ("TOPPADDING", (0,0), (-1,-1), 1), ("BOTTOMPADDING", (0,0), (-1,-1), 1)]),
        ),
        # Right cell: TAX INVOICE + number
        Table(
            [
                [_para("TAX INVOICE", "title")],
                [_para(f"# {invoice_number}", "inv_num")],
                [_para(f"Date: {invoice_date}", "body")],
                [_para(f"Due: {due_date}" if due_date else "", "body")],
            ],
            colWidths=[CONTENT_W * 0.4],
            style=TableStyle([("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 0), ("TOPPADDING", (0,0), (-1,-1), 1), ("BOTTOMPADDING", (0,0), (-1,-1), 1), ("ALIGN", (0,0), (-1,-1), "RIGHT")]),
        ),
    ]]
    header_table = Table(header_data, colWidths=[CONTENT_W * 0.6, CONTENT_W * 0.4])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 5 * mm))
    story.append(HRFlowable(width=CONTENT_W, thickness=1.5, color=_PRIMARY, spaceAfter=5 * mm))

    # ── 3. Bill From / Bill To ─────────────────────────────────────────────────
    buyer_name  = invoice_data.get("buyer_name")  or "—"
    buyer_gstin = invoice_data.get("buyer_gstin") or ""

    parties_data = [[
        Table(
            [
                [_para("BILL FROM", "section")],
                [_para(company_name, "value")],
                [_para(f"GSTIN: {company_gstin}" if company_gstin else "", "body")],
            ],
            colWidths=[CONTENT_W * 0.48],
            style=TableStyle([("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 0), ("TOPPADDING", (0,0), (-1,-1), 1), ("BOTTOMPADDING", (0,0), (-1,-1), 1)]),
        ),
        Table(
            [
                [_para("BILL TO", "section")],
                [_para(buyer_name, "value")],
                [_para(f"GSTIN: {buyer_gstin}" if buyer_gstin else "", "body")],
            ],
            colWidths=[CONTENT_W * 0.48],
            style=TableStyle([("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 0), ("TOPPADDING", (0,0), (-1,-1), 1), ("BOTTOMPADDING", (0,0), (-1,-1), 1)]),
        ),
    ]]
    parties_table = Table(parties_data, colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5])
    parties_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), _BG2),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(parties_table)
    story.append(Spacer(1, 6 * mm))

    # ── 4. Line items table ───────────────────────────────────────────────────
    line_items = invoice_data.get("line_items") or []

    col_w = [CONTENT_W * p for p in [0.38, 0.08, 0.14, 0.10, 0.14, 0.16]]
    items_header = [
        _para("DESCRIPTION",   "col_header"),
        _para("QTY",           "col_header"),
        _para("UNIT PRICE",    "col_header"),
        _para("GST %",         "col_header"),
        _para("GST AMT",       "col_header"),
        _para("TOTAL",         "col_header"),
    ]
    items_rows: list = [items_header]

    for item in line_items:
        qty        = float(item.get("quantity")   or 0)
        unit_price = float(item.get("unit_price") or 0)
        gst_rate   = float(item.get("gst_rate")   or 0)
        base       = qty * unit_price
        gst_amt    = item.get("cgst", 0) + item.get("sgst", 0) + item.get("igst", 0)
        if not gst_amt:
            gst_amt = base * (gst_rate / 100)
        total      = float(item.get("total") or (base + gst_amt))

        items_rows.append([
            _para(item.get("description") or "—", "body"),
            _para(f"{qty:g}",              "body_r"),
            _para(_fmt_inr(unit_price),    "body_r"),
            _para(f"{gst_rate:g}%",        "body_r"),
            _para(_fmt_inr(gst_amt),       "body_r"),
            _para(_fmt_inr(total),         "bold_r"),
        ])

    items_table = Table(items_rows, colWidths=col_w, repeatRows=1)
    items_style = TableStyle([
        # Header row
        ("BACKGROUND",    (0, 0), (-1, 0),  _PRIMARY),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  _WHITE),
        ("TOPPADDING",    (0, 0), (-1, 0),  6),
        ("BOTTOMPADDING", (0, 0), (-1, 0),  6),
        ("LEFTPADDING",   (0, 0), (-1, 0),  6),
        ("RIGHTPADDING",  (0, 0), (-1, 0),  6),
        # Data rows
        ("TOPPADDING",    (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("LEFTPADDING",   (0, 1), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 1), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",         (1, 1), (-1, -1), "RIGHT"),
        # Alternating rows
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [_WHITE, _BG2]),
        # Bottom border
        ("LINEBELOW",     (0, -1), (-1, -1), 1, _BORDER),
        ("LINEBELOW",     (0, 0),  (-1, 0),  0.5, _PRIMARY),
    ])
    items_table.setStyle(items_style)
    story.append(items_table)
    story.append(Spacer(1, 4 * mm))

    # ── 5. Totals block ────────────────────────────────────────────────────────
    subtotal   = float(invoice_data.get("subtotal")    or 0)
    total_cgst = float(invoice_data.get("total_cgst")  or 0)
    total_sgst = float(invoice_data.get("total_sgst")  or 0)
    total_igst = float(invoice_data.get("total_igst")  or 0)
    total_gst  = float(invoice_data.get("total_gst")   or total_cgst + total_sgst + total_igst)
    grand_total = float(invoice_data.get("grand_total") or subtotal + total_gst)

    totals_rows = []
    if subtotal:
        totals_rows.append([_para("Subtotal", "body_r"), _para(_fmt_inr(subtotal), "body_r")])
    if total_cgst:
        totals_rows.append([_para("CGST",    "body_r"), _para(_fmt_inr(total_cgst), "body_r")])
    if total_sgst:
        totals_rows.append([_para("SGST",    "body_r"), _para(_fmt_inr(total_sgst), "body_r")])
    if total_igst:
        totals_rows.append([_para("IGST",    "body_r"), _para(_fmt_inr(total_igst), "body_r")])
    elif not (total_cgst or total_sgst) and total_gst:
        totals_rows.append([_para("Total GST", "body_r"), _para(_fmt_inr(total_gst), "body_r")])

    totals_rows.append([
        _para("GRAND TOTAL", "total_label"),
        _para(_fmt_inr(grand_total), "total_val"),
    ])

    totals_table = Table(
        totals_rows,
        colWidths=[CONTENT_W * 0.75, CONTENT_W * 0.25],
    )
    totals_table.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -2), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -2), 3),
        ("TOPPADDING",    (0, -1), (-1, -1), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 8),
        ("LINEABOVE",     (0, -1), (-1, -1), 1.5, _PRIMARY),
        ("BACKGROUND",    (0, -1), (-1, -1), colors.HexColor("#EDF5F0")),
        ("ALIGN",         (0, 0), (-1, -1), "RIGHT"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 8 * mm))

    # ── 6. Footer ──────────────────────────────────────────────────────────────
    story.append(HRFlowable(width=CONTENT_W, thickness=0.5, color=_BORDER, spaceBefore=4 * mm))
    story.append(Spacer(1, 2 * mm))
    story.append(_para(
        f"This is a computer-generated tax invoice. Invoice type: {invoice_type}. "
        "Generated by Raseed.",
        "footer",
    ))

    doc.build(story)
    return buf.getvalue()

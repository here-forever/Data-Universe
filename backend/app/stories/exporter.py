from __future__ import annotations

import re
from html import escape
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models import Story

CJK_PATTERN = re.compile(r"([\u2e80-\u9fff\uf900-\ufaff]+)")
LATIN_FONT_CANDIDATES = (
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("C:/Windows/Fonts/arial.ttf"),
)


def export_html(story: Story, destination: Path, locale: str = "zh-CN") -> Path:
    blocks = "".join(render_html_block(block) for block in story.blocks)
    document = f"""<!doctype html>
<html lang="{escape(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape(story.title)}</title>
  <style>
    body {{ margin: 0; background: #f4f7f5; color: #16201c; font: 16px/1.7 system-ui, sans-serif; }}
    main {{ width: min(880px, calc(100% - 40px)); margin: 56px auto; }}
    header {{ border-bottom: 1px solid #cfd8d3; padding-bottom: 28px; margin-bottom: 28px; }}
    h1 {{ font-size: 42px; line-height: 1.1; margin: 0 0 14px; }}
    section {{ padding: 24px 0; border-bottom: 1px solid #dfe6e2; }}
    h2 {{ font-size: 24px; margin: 0 0 10px; }}
    .metric {{ color: #087f67; font-size: 32px; font-weight: 720; }}
    .metric .unit {{ font-size: 16px; color: #5b6b64; margin-left: 6px; font-weight: 500; }}
    .caption {{ color: #5b6b64; font-size: 14px; margin-top: 8px; }}
    .chart-meta {{ color: #087f67; font-weight: 600; margin: 6px 0; }}
    .signals {{ margin: 8px 0; padding-left: 20px; }}
    .signals li {{ margin: 4px 0; }}
    .kv {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
    .kv th, .kv td {{ text-align: left; padding: 8px 10px;
      border-bottom: 1px solid #dfe6e2; vertical-align: top; }}
    .kv th {{ color: #5b6b64; font-weight: 600; width: 38%; }}
    .kv td {{ color: #16201c; }}
  </style>
</head>
<body><main><header><h1>{escape(story.title)}</h1><p>{escape(story.summary)}</p></header>{blocks}</main></body>
</html>"""
    destination.write_text(document, encoding="utf-8")
    return destination


NOISE_KEYS = {"points", "categories", "series"}


def _payload_kv(payload: dict[str, Any]) -> str:
    rows = []
    for key, value in payload.items():
        if key in NOISE_KEYS or value is None:
            continue
        if isinstance(value, list):
            value = ", ".join(str(item) for item in value)
        elif isinstance(value, dict):
            value = ", ".join(f"{k}={v}" for k, v in value.items())
        rows.append(f"<tr><th>{escape(str(key))}</th><td>{escape(str(value))}</td></tr>")
    if not rows:
        return ""
    return f'<table class="kv">{ "".join(rows) }</table>'


def _chart_details(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    meta = [str(payload[key]) for key in ("type", "confidence") if payload.get(key)]
    if payload.get("score") is not None:
        meta.append(f"score {payload['score']}")
    if meta:
        parts.append(f'<p class="chart-meta">{escape(" · ".join(meta))}</p>')
    if payload.get("signals"):
        items = "".join(f"<li>{escape(str(s))}</li>" for s in payload["signals"])
        parts.append(f'<ul class="signals">{items}</ul>')
    axes = [str(payload[key]) for key in ("x_field", "y_field") if payload.get(key)]
    if axes:
        parts.append(f'<p class="caption">轴：{escape(" × ".join(axes))}</p>')
    return "".join(parts)


def render_html_block(block: dict[str, Any]) -> str:
    kind = block.get("kind")
    payload = block.get("payload") or {}
    details = ""
    if kind == "metric" and payload.get("value") is not None:
        details = f'<div class="metric">{escape(str(payload["value"]))}</div>'
    elif kind == "cover" and payload.get("source"):
        details = f'<p class="caption">数据来源：{escape(str(payload["source"]))}</p>'
    elif kind == "quality" and payload.get("quality_score") is not None:
        details = (
            f'<div class="metric">{escape(str(payload["quality_score"]))}'
            f'<span class="unit">/ 100</span></div>'
        )
    elif kind == "chart":
        details = _chart_details(payload)
    elif payload:
        details = _payload_kv(payload)
    return (
        f"<section><h2>{escape(str(block.get('title', 'Insight')))}</h2>"
        f"<p>{escape(str(block.get('body', '')))}</p>{details}</section>"
    )


def export_pdf(story: Story, destination: Path) -> Path:
    latin_font = register_pdf_fonts()
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ChineseTitle",
        parent=styles["Title"],
        fontName=latin_font,
        fontSize=24,
        leading=31,
        textColor=colors.HexColor("#16201c"),
        alignment=TA_LEFT,
    )
    heading_style = ParagraphStyle(
        "ChineseHeading",
        parent=styles["Heading2"],
        fontName=latin_font,
        fontSize=15,
        leading=21,
        textColor=colors.HexColor("#087f67"),
    )
    body_style = ParagraphStyle(
        "ChineseBody",
        parent=styles["BodyText"],
        fontName=latin_font,
        fontSize=10.5,
        leading=17,
        textColor=colors.HexColor("#263b33"),
    )
    doc = SimpleDocTemplate(
        str(destination),
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=22 * mm,
        bottomMargin=22 * mm,
    )
    flow: list[Any] = [
        Paragraph(pdf_font_markup(story.title, latin_font), title_style),
        Spacer(1, 6 * mm),
        Paragraph(pdf_font_markup(story.summary, latin_font), body_style),
        Spacer(1, 8 * mm),
    ]
    for block in story.blocks:
        flow.append(
            Paragraph(
                pdf_font_markup(str(block.get("title", "Insight")), latin_font),
                heading_style,
            )
        )
        flow.append(Paragraph(pdf_font_markup(str(block.get("body", "")), latin_font), body_style))
        payload = block.get("payload") or {}
        if payload:
            rows = [
                [
                    Paragraph(pdf_font_markup(str(key), latin_font), body_style),
                    Paragraph(pdf_font_markup(str(value), latin_font), body_style),
                ]
                for key, value in list(payload.items())[:8]
            ]
            table = Table(rows, colWidths=[42 * mm, 105 * mm], hAlign="LEFT")
            table.setStyle(
                TableStyle(
                    [
                        ("FONTNAME", (0, 0), (-1, -1), latin_font),
                        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#334b42")),
                        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#c9d6d0")),
                        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#edf3f0")),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ]
                )
            )
            flow.extend([Spacer(1, 2 * mm), table])
        flow.append(Spacer(1, 7 * mm))
    doc.build(flow)
    return destination


def register_pdf_fonts() -> str:
    if "STSong-Light" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    for path in LATIN_FONT_CANDIDATES:
        if path.is_file():
            if "VibeSans" not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(TTFont("VibeSans", path))
            return "VibeSans"
    return "Helvetica"


def pdf_font_markup(value: str, latin_font: str) -> str:
    runs = CJK_PATTERN.split(value)
    return "".join(
        f'<font name="{("STSong-Light" if CJK_PATTERN.fullmatch(run) else latin_font)}">'
        f"{escape(run)}</font>"
        for run in runs
        if run
    )

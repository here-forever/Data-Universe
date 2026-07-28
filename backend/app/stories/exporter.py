from __future__ import annotations

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
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models import Story


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
    pre {{ white-space: pre-wrap; background: #16201c; color: #e9fff7;
      padding: 18px; border-radius: 6px; }}
  </style>
</head>
<body><main><header><h1>{escape(story.title)}</h1><p>{escape(story.summary)}</p></header>{blocks}</main></body>
</html>"""
    destination.write_text(document, encoding="utf-8")
    return destination


def render_html_block(block: dict[str, Any]) -> str:
    payload = block.get("payload", {})
    details = ""
    if block.get("kind") == "metric" and payload.get("value") is not None:
        details = f'<div class="metric">{escape(str(payload["value"]))}</div>'
    elif payload:
        details = f"<pre>{escape(str(payload))}</pre>"
    return (
        f"<section><h2>{escape(str(block.get('title', 'Insight')))}</h2>"
        f"<p>{escape(str(block.get('body', '')))}</p>{details}</section>"
    )


def export_pdf(story: Story, destination: Path) -> Path:
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ChineseTitle",
        parent=styles["Title"],
        fontName="STSong-Light",
        fontSize=24,
        leading=31,
        textColor=colors.HexColor("#16201c"),
        alignment=TA_LEFT,
    )
    heading_style = ParagraphStyle(
        "ChineseHeading",
        parent=styles["Heading2"],
        fontName="STSong-Light",
        fontSize=15,
        leading=21,
        textColor=colors.HexColor("#087f67"),
    )
    body_style = ParagraphStyle(
        "ChineseBody",
        parent=styles["BodyText"],
        fontName="STSong-Light",
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
        Paragraph(escape(story.title), title_style),
        Spacer(1, 6 * mm),
        Paragraph(escape(story.summary), body_style),
        Spacer(1, 8 * mm),
    ]
    for block in story.blocks:
        flow.append(Paragraph(escape(str(block.get("title", "Insight"))), heading_style))
        flow.append(Paragraph(escape(str(block.get("body", ""))), body_style))
        payload = block.get("payload") or {}
        if payload:
            rows = [[str(key), str(value)] for key, value in list(payload.items())[:8]]
            table = Table(rows, colWidths=[42 * mm, 105 * mm], hAlign="LEFT")
            table.setStyle(
                TableStyle(
                    [
                        ("FONTNAME", (0, 0), (-1, -1), "STSong-Light"),
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

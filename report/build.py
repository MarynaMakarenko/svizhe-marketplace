#!/usr/bin/env python3
"""Збирає звіт: REPORT.md → DOCX (pandoc) → PDF (LibreOffice).

Зміст будується у два проходи: спершу документ збирається з порожніми номерами сторінок,
потім номери зчитуються з отриманого PDF і підставляються у зміст.
Потрібні: pandoc, LibreOffice (soffice), pdftotext, uv (лише для створення reference.docx).
"""
import re
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
OUT = "Звіт_Свіже_Макаренко_Полежай"
SOFFICE = "/Applications/LibreOffice.app/Contents/MacOS/soffice" if sys.platform == "darwin" else "soffice"


def headings(md):
    """Заголовки 1-го та 2-го рівня (без тих, що всередині блоків коду)."""
    result, in_code = [], False
    for line in md.splitlines():
        if line.startswith("```"):
            in_code = not in_code
        m = None if in_code else re.match(r"^(#{1,2}) (.+)$", line)
        if m:
            result.append((len(m.group(1)), m.group(2).strip()))
    return result


def toc_xml(items, pages):
    rows = ['<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
            '<w:p><w:pPr><w:pStyle w:val="TOCHeading"/></w:pPr><w:r><w:t>ЗМІСТ</w:t></w:r></w:p>']
    for i, (level, title) in enumerate(items):
        style = "TOCLine" if level == 1 else "TOCLine2"
        rows.append(f'<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr>'
                    f'<w:r><w:t xml:space="preserve">{escape(title)}</w:t></w:r>'
                    f'<w:r><w:tab/></w:r><w:r><w:t>{pages.get(i, "")}</w:t></w:r></w:p>')
    return "```{=openxml}\n" + "\n".join(rows) + "\n```\n"


def build(md, items, pages):
    (HERE / "_build.md").write_text(md.replace("<!-- TOC -->", toc_xml(items, pages)), encoding="utf-8")
    subprocess.run(["pandoc", "_build.md", "-o", f"{OUT}.docx", "--reference-doc=reference.docx",
                    "--resource-path=.", "--from", "markdown+raw_attribute", "--syntax-highlighting=none",
                    "--lua-filter=tables.lua"],
                   cwd=HERE, check=True)
    subprocess.run([SOFFICE, "--headless", "--convert-to", "pdf", f"{OUT}.docx"],
                   cwd=HERE, check=True, capture_output=True)
    (HERE / "_build.md").unlink()


def find_pages(items):
    text = subprocess.run(["pdftotext", "-layout", f"{OUT}.pdf", "-"], cwd=HERE, check=True,
                          capture_output=True, text=True).stdout
    norm = lambda s: re.sub(r"\s+", " ", s).strip()
    page_lines = [[norm(l) for l in p.splitlines()] for p in text.split("\f")]
    pages, start = {}, 2  # сторінки 1–2: титул і зміст
    for i, (_, title) in enumerate(items):
        for n in range(start, len(page_lines)):
            if norm(title) in page_lines[n]:
                pages[i], start = n + 1, n
                break
        else:
            print("  ! не знайдено сторінку для:", title)
    return pages, len(page_lines) - 1


def main():
    if not (HERE / "reference.docx").exists():
        subprocess.run(["uv", "run", "--no-project", "--with", "python-docx", "python",
                        "make_reference.py", "reference.docx"], cwd=HERE, check=True)
    md = (HERE / "REPORT.md").read_text(encoding="utf-8")
    items = headings(md)
    build(md, items, {})
    pages, _ = find_pages(items)
    build(md, items, pages)
    check, total = find_pages(items)
    if check != pages:
        print("  ! номери сторінок змістилися після другого проходу — запустіть ще раз")
    print(f"Готово: {OUT}.docx, {OUT}.pdf — сторінок: {total}, пунктів змісту: {len(pages)}/{len(items)}")


if __name__ == "__main__":
    main()

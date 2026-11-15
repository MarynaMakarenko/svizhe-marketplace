"""Створює reference.docx — шаблон стилів для pandoc (Times New Roman 14, інтервал 1,5, поля за ДСТУ 3008)."""
import subprocess, sys
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

out = sys.argv[1]
subprocess.run(["pandoc", "-o", out, "--print-default-data-file", "reference.docx"], check=True)
doc = Document(out)
FONT = "Times New Roman"

def font(style, size, bold=None, italic=None, name=FONT):
    style.font.name = name
    style.font.size = Pt(size)
    style.font.color.rgb = RGBColor(0, 0, 0)
    if bold is not None: style.font.bold = bold
    if italic is not None: style.font.italic = italic
    rpr = style.element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts"); rpr.append(rfonts)
    for a in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        rfonts.set(qn(a), name)
    for a in ("w:asciiTheme", "w:hAnsiTheme", "w:cstheme", "w:eastAsiaTheme"):
        if rfonts.get(qn(a)) is not None: del rfonts.attrib[qn(a)]

def para(style, align=None, spacing=1.5, before=0, after=0, indent=None, keep=None, page_break=None):
    pf = style.paragraph_format
    if align is not None: pf.alignment = align
    pf.line_spacing = spacing
    pf.space_before = Pt(before); pf.space_after = Pt(after)
    if indent is not None: pf.first_line_indent = Cm(indent)
    if keep is not None: pf.keep_with_next = keep
    if page_break is not None: pf.page_break_before = page_break

class Styles:
    """Повертає стиль за назвою, а якщо його немає в шаблоні pandoc — створює."""
    CHAR = {"Verbatim Char"}
    def __getitem__(self, name):
        try:
            return doc.styles[name]
        except KeyError:
            return doc.styles.add_style(name, 2 if name in self.CHAR else 1)
    def add_style(self, name, kind):
        return doc.styles.add_style(name, kind)

S = Styles()
J, C, L, R = WD_ALIGN_PARAGRAPH.JUSTIFY, WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.LEFT, WD_ALIGN_PARAGRAPH.RIGHT

font(S["Normal"], 14); para(S["Normal"], J)
for name in ("Body Text", "First Paragraph"):
    font(S[name], 14); para(S[name], J, indent=1.25)
S["First Paragraph"].paragraph_format.space_before = Pt(6)  # відступ після таблиць і рисунків
font(S["Compact"], 12); para(S["Compact"], L, spacing=1.15, indent=0)
font(S["Heading 1"], 16, bold=True); para(S["Heading 1"], C, before=0, after=14, indent=0, keep=True, page_break=True)
font(S["Heading 2"], 14, bold=True); para(S["Heading 2"], L, before=14, after=8, indent=0, keep=True)
font(S["Heading 3"], 14, bold=True, italic=True); para(S["Heading 3"], L, before=10, after=6, indent=0, keep=True)
for name in ("Image Caption", "Table Caption"):
    font(S[name], 12, italic=False); para(S[name], C, spacing=1.15, before=4, after=12, indent=0)
para(S["Captioned Figure"], C, spacing=1.0, before=8, after=0, indent=0, keep=True)
para(S["Figure"], C, spacing=1.0, before=8, after=0, indent=0)
font(S["Source Code"], 10, name="Courier New"); para(S["Source Code"], L, spacing=1.0, before=4, after=8, indent=0)
font(S["Verbatim Char"], 11, name="Courier New")
for name in ("TOC Heading",):
    font(S[name], 16, bold=True); para(S[name], C, after=14)
# рядки змісту: назва, крапки-заповнювач, номер сторінки праворуч
from docx.enum.text import WD_TAB_ALIGNMENT, WD_TAB_LEADER
for name, ind in (("TOCLine", 0), ("TOCLine2", 0.8)):
    st = S[name]; st.base_style = doc.styles["Normal"]
    font(st, 14); para(st, L, spacing=1.3, indent=0)
    st.paragraph_format.left_indent = Cm(ind)
    st.paragraph_format.tab_stops.add_tab_stop(Cm(16.5), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)

# стилі титульної сторінки
def add(name, size, align, bold=False, after=0, left=None):
    st = S.add_style(name, 1); st.base_style = S["Normal"]
    font(st, size, bold=bold); para(st, align, spacing=1.3, after=after, indent=0)
    if left is not None: st.paragraph_format.left_indent = Cm(left)
add("TitleCenter", 14, C)
add("TitleBig", 22, C, bold=True, after=6)
add("TitleSub", 16, C)
add("TitleRight", 14, L, left=9)

# таблиці: тонкі рамки
tbl = doc.styles["Table"].element
tblPr = tbl.find(qn("w:tblPr"))
if tblPr is None:
    tblPr = OxmlElement("w:tblPr"); tbl.append(tblPr)
old = tblPr.find(qn("w:tblBorders"))
if old is not None: tblPr.remove(old)
borders = OxmlElement("w:tblBorders")
for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
    b = OxmlElement(f"w:{side}")
    b.set(qn("w:val"), "single"); b.set(qn("w:sz"), "4"); b.set(qn("w:space"), "0"); b.set(qn("w:color"), "808080")
    borders.append(b)
tblPr.append(borders)

# сторінка A4, поля, номер сторінки внизу по центру
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21), Cm(29.7)
sec.left_margin, sec.right_margin, sec.top_margin, sec.bottom_margin = Cm(3), Cm(1.5), Cm(2), Cm(2)
sec.different_first_page_header_footer = True
p = sec.footer.paragraphs[0]; p.alignment = C
run = p.add_run()
for kind, text in (("begin", None), (None, "PAGE"), ("end", None)):
    if kind:
        el = OxmlElement("w:fldChar"); el.set(qn("w:fldCharType"), kind)
    else:
        el = OxmlElement("w:instrText"); el.text = text
    run._r.append(el)
run.font.name = FONT; run.font.size = Pt(12)
doc.save(out)
print("reference:", out)

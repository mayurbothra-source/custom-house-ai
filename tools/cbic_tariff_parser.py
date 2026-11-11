#!/usr/bin/env python3
"""
CBIC Customs Tariff Parser — Custom House AI (Path B)
=====================================================
Extracts 8-digit tariff items from CBIC First Schedule chapter PDFs.

WHY THIS EXISTS
---------------
Deterministic parsing, no AI. No Gemini quota, no 429, and — critically —
the output is REPRODUCIBLE. You can re-run it and get identical results,
which means the data is auditable if customs raises a query.

WHAT IT EXTRACTS
----------------
  CTH (8-digit tariff item)
  Description (full, hierarchy-reconstructed — see below)
  UQC (unit of quantity)
  BCD_Statutory (First Schedule statutory rate)

WHAT IT DOES NOT EXTRACT — READ THIS
------------------------------------
The First Schedule gives the STATUTORY rate. The rate you actually file on
is the EFFECTIVE rate after exemption notifications (45/2025-Cus and later).
Statutory is almost always HIGHER than effective.

BCD_Statutory is therefore written to its own column and duty.js must NOT
read it as the filing rate. It is reference data only.

IGST, AIDC, Health Cess, Compensation Cess and ADD are NOT in the First
Schedule at all. They come from GST rate notifications and separate levy
notifications. Different sources, different scanner.

THE HARD PART — HIERARCHICAL DESCRIPTIONS
-----------------------------------------
Tariff PDFs print descriptions as an indented tree:

    8481          Taps, cocks, valves for pipes...
    848180        -  Other appliances
    84818010      --   Gate valves
    84818081      ---    Ball valves

Extracted naively, 84818081 reads "Ball valves" with no context, and
thousands of rows read just "Other". This parser tracks dash-depth and
walks up the ancestor stack to compose the full description:

    "Taps, cocks, valves for pipes > Other appliances > Gate valves > Ball valves"

USAGE
-----
    pip install pdfplumber openpyxl
    python cbic_tariff_parser.py ./chapter_pdfs/ -o tariff.xlsx

    # single chapter, with the raw-row dump for debugging a bad parse
    python cbic_tariff_parser.py ./chapter_pdfs/chapter-84.pdf --debug
"""

import argparse
import re
import sys
from pathlib import Path
from datetime import datetime

try:
    import pdfplumber
except ImportError:
    sys.exit("Missing dependency. Run:  pip install pdfplumber openpyxl")

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    sys.exit("Missing dependency. Run:  pip install pdfplumber openpyxl")


# ─────────────────────────────────────────────────────────────────────────
# PATTERNS
# ─────────────────────────────────────────────────────────────────────────
# CBIC prints tariff items with or without spaces: "84818081" or "8481 80 81"
RE_TARIFF_ITEM = re.compile(r'^(\d{4})\s?(\d{2})\s?(\d{2})\b')
RE_SUBHEADING  = re.compile(r'^(\d{4})\s?(\d{2})\b(?!\s?\d{2})')
RE_HEADING     = re.compile(r'^(\d{4})\b(?!\s?\d{2})')
RE_DASH_PREFIX = re.compile(r'^([-\u2010-\u2015\u2212\s]*)')
RE_RATE        = re.compile(r'(\d+(?:\.\d+)?)\s*%')
RE_FREE        = re.compile(r'\bfree\b', re.I)

# Standard Indian UQC codes
UQC_SET = {
    "KGS","KGM","NOS","MTR","SQM","CBM","LTR","TON","GMS","PCS","PRS","SET",
    "DOZ","GRS","BAG","BAL","BDL","BKL","BOU","BOX","BTL","BUN","CAN","CTN",
    "CCM","CMS","CYL","DRM","MLT","MTS","PAC","QTL","ROL","SQF","SQY","TBS",
    "TGM","THD","TUB","UGS","UNT","VLS","WSQ","YDS","U","KG","L","M","T"
}


# ─────────────────────────────────────────────────────────────────────────
# HIERARCHY TRACKER
# ─────────────────────────────────────────────────────────────────────────
class DescriptionTree:
    """
    Reconstructs full descriptions from the tariff's dash-indented tree.

    Each row's dash count is its depth. On seeing a row at depth N we pop the
    ancestor stack back to N, push this row, and the full description is the
    stack joined. A 4-digit heading resets the stack to depth 0.
    """

    def __init__(self):
        self.stack = []          # list of (depth, text)
        self.heading_text = ""

    def reset_heading(self, text):
        self.heading_text = _clean(text)
        self.stack = []

    @staticmethod
    def dash_depth(raw_desc):
        """Count leading dashes. '- Other' = 1, '-- Of cotton' = 2."""
        m = RE_DASH_PREFIX.match(raw_desc)
        if not m:
            return 0
        # Normalise all unicode dash variants to ASCII hyphen, then count
        prefix = m.group(1)
        return len(re.sub(r'[^\-\u2010-\u2015\u2212]', '', prefix)
                   .replace('\u2010', '-').replace('\u2011', '-')
                   .replace('\u2012', '-').replace('\u2013', '-')
                   .replace('\u2014', '-').replace('\u2015', '-')
                   .replace('\u2212', '-'))

    def push(self, raw_desc):
        """Add a row; return its fully-composed description."""
        depth = self.dash_depth(raw_desc)
        text = _clean(RE_DASH_PREFIX.sub('', raw_desc, count=1))
        if not text:
            return self.full()
        # pop back to this depth
        while self.stack and self.stack[-1][0] >= depth:
            self.stack.pop()
        self.stack.append((depth, text))
        return self.full()

    def full(self):
        """
        Compose the full chain. NEVER drop 'Other' nodes — a residual 'Other'
        tariff item described by its parent alone is factually wrong. E.g.
        84818090 is NOT a gate valve; it is the residual line under 'Other
        appliances'. Collapsing it would produce a confident wrong description.
        Only adjacent duplicates are removed.
        """
        parts = ([self.heading_text] if self.heading_text else []) + \
                [t for _, t in self.stack]
        chain = []
        for p in parts:
            if p and (not chain or chain[-1].lower() != p.lower()):
                chain.append(p)
        return " > ".join(chain)


def _clean(s):
    s = re.sub(r'\s+', ' ', s or '').strip()
    s = s.strip(' :;,.')
    return s


# ─────────────────────────────────────────────────────────────────────────
# ROW PARSING
# ─────────────────────────────────────────────────────────────────────────
def parse_rate(cell):
    """
    'Free' -> 0.0
    '10%'  -> 10.0
    '7.5%' -> 7.5
    Specific rates ('Rs 300 per kg') -> None + the raw text preserved upstream.
    """
    if not cell:
        return None
    if RE_FREE.search(cell):
        return 0.0
    m = RE_RATE.search(cell)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    return None


def find_uqc(cells):
    for c in cells:
        if not c:
            continue
        tok = c.strip().upper().replace('.', '')
        if tok in UQC_SET:
            return tok
    return ""


def parse_chapter_pdf(pdf_path, debug=False):
    """Parse one chapter PDF. Returns (rows, warnings)."""
    rows = []
    warnings = []
    tree = DescriptionTree()
    chapter_no = None

    with pdfplumber.open(pdf_path) as pdf:
        for pno, page in enumerate(pdf.pages, 1):

            # Prefer table extraction; tariff pages are ruled tables.
            tables = page.extract_tables()
            if not tables:
                # Fall back to text lines for pages where ruling is missing
                tables = [[[ln] for ln in (page.extract_text() or "").split("\n")]]

            for table in tables:
                for raw_row in table:
                    cells = [(c or "").strip() for c in raw_row]
                    if not any(cells):
                        continue

                    first = cells[0]
                    joined = " ".join(cells)

                    if debug:
                        print(f"  [p{pno}] {cells}", file=sys.stderr)

                    # Chapter number, taken from the first heading we see
                    if chapter_no is None:
                        mh = RE_HEADING.match(first)
                        if mh:
                            chapter_no = mh.group(1)[:2]

                    # 4-digit heading row → resets the description tree
                    mh = RE_HEADING.match(first)
                    if mh and not RE_TARIFF_ITEM.match(first):
                        desc_cell = cells[1] if len(cells) > 1 else ""
                        tree.reset_heading(desc_cell or joined)
                        continue

                    # 6-digit subheading row: a structural node, not an item.
                    # Push it onto the tree so its children inherit it, but do
                    # not emit a row — it is not a filable tariff item.
                    ms = RE_SUBHEADING.match(first)
                    if ms and not RE_TARIFF_ITEM.match(first):
                        desc_cell = cells[1] if len(cells) > 1 else ""
                        if desc_cell:
                            tree.push(desc_cell)
                        continue

                    # 8-digit tariff item row
                    mt = RE_TARIFF_ITEM.match(first)
                    if not mt:
                        # Continuation line: append to the current node
                        if tree.stack and len(cells) > 1 and cells[1]:
                            d, t = tree.stack[-1]
                            tree.stack[-1] = (d, _clean(t + " " + cells[1]))
                        continue

                    cth = mt.group(1) + mt.group(2) + mt.group(3)
                    desc_cell = cells[1] if len(cells) > 1 else ""
                    full_desc = tree.push(desc_cell)

                    uqc = find_uqc(cells[2:])
                    # Statutory rate: scan remaining cells, take first parseable
                    stat = None
                    stat_raw = ""
                    for c in cells[2:]:
                        r = parse_rate(c)
                        if r is not None:
                            stat, stat_raw = r, c.strip()
                            break

                    if not full_desc:
                        warnings.append(f"{cth}: empty description (p{pno})")

                    rows.append({
                        "cth": cth,
                        "chapter": cth[:2],
                        "heading": cth[:4],
                        "description": full_desc,
                        "uqc": uqc,
                        "bcd_statutory": stat if stat is not None else "",
                        "bcd_raw": stat_raw,
                        "source_pdf": Path(pdf_path).name,
                        "page": pno,
                    })

    return rows, warnings


# ─────────────────────────────────────────────────────────────────────────
# VALIDATION
# ─────────────────────────────────────────────────────────────────────────
def validate(rows):
    """Returns list of problems. Empty list means the parse looks sane."""
    problems = []
    seen = {}

    for r in rows:
        c = r["cth"]
        if len(c) != 8 or not c.isdigit():
            problems.append(f"Malformed CTH: {c!r}")
        if not r["description"]:
            problems.append(f"{c}: no description")
        elif r["description"].lower().strip() in {"other", "others"}:
            problems.append(f"{c}: description is bare 'Other' — hierarchy lost")
        if c in seen:
            problems.append(f"{c}: duplicate (also {seen[c]})")
        seen[c] = r["source_pdf"]

    # Sanity: a real chapter PDF should yield a plausible row count
    by_ch = {}
    for r in rows:
        by_ch.setdefault(r["chapter"], 0)
        by_ch[r["chapter"]] += 1
    for ch, n in sorted(by_ch.items()):
        if n < 3:
            problems.append(f"Chapter {ch}: only {n} rows — likely a failed parse")

    return problems


# Known-good spot checks from assessed Bills of Entry.
# If the parser reproduces these codes, confidence is high.
SPOT_CHECKS = ["84798999", "85419000", "84818090", "39100090", "32065000"]


# ─────────────────────────────────────────────────────────────────────────
# OUTPUT
# ─────────────────────────────────────────────────────────────────────────
NAVY = "0A0F1E"; WHITE = "FFFFFF"; ALT = "F2F4F8"; HDRBG = "1E3A5F"

def write_xlsx(rows, out_path):
    today = datetime.now().strftime("%Y-%m-%d")
    headers = ["CTH", "Description", "UQC", "BCD_Statutory_%", "BCD_Raw",
               "Chapter", "Heading", "Rate_Basis", "Source", "Last_Updated"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "TariffItems"
    ws.freeze_panes = "A2"
    ws.sheet_view.showGridLines = False
    ws.row_dimensions[1].height = 28

    thin = Side(style="thin", color="AAAAAA")
    for i, h in enumerate(headers, 1):
        c = ws.cell(row=1, column=i, value=h)
        c.font = Font(name="Arial", bold=True, color=WHITE, size=9)
        c.fill = PatternFill("solid", fgColor=HDRBG)
        c.alignment = Alignment(horizontal="center", vertical="center",
                                wrap_text=True)
        c.border = Border(left=thin, right=thin, top=thin, bottom=thin)

    thin2 = Side(style="thin", color="DDDDDD")
    for ri, r in enumerate(sorted(rows, key=lambda x: x["cth"]), 2):
        bg = ALT if ri % 2 == 0 else WHITE
        vals = [r["cth"], r["description"], r["uqc"], r["bcd_statutory"],
                r["bcd_raw"], r["chapter"], r["heading"],
                "STATUTORY — not the filing rate", r["source_pdf"], today]
        for ci, v in enumerate(vals, 1):
            c = ws.cell(row=ri, column=ci, value=v)
            c.font = Font(name="Arial", size=9, color=NAVY)
            c.fill = PatternFill("solid", fgColor=bg)
            c.border = Border(left=thin2, right=thin2, top=thin2, bottom=thin2)
            c.alignment = Alignment(
                horizontal="left" if ci in (2, 8, 9) else "center",
                vertical="center")
        ws.row_dimensions[ri].height = 15

    for col in ws.columns:
        cl = get_column_letter(col[0].column)
        ml = max((len(str(c.value)) for c in col if c.value), default=8)
        ws.column_dimensions[cl].width = min(60, max(8, ml + 2))

    wb.save(out_path)


# ─────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(
        description="Parse CBIC Customs Tariff chapter PDFs into an Excel workbook.")
    ap.add_argument("path", help="A chapter PDF, or a folder containing them")
    ap.add_argument("-o", "--out", default="cbic_tariff_items.xlsx",
                    help="Output .xlsx path")
    ap.add_argument("--debug", action="store_true",
                    help="Dump every extracted row to stderr")
    args = ap.parse_args()

    p = Path(args.path)
    if p.is_dir():
        pdfs = sorted(p.glob("*.pdf"))
    elif p.suffix.lower() == ".pdf":
        pdfs = [p]
    else:
        sys.exit(f"Not a PDF or folder: {p}")

    if not pdfs:
        sys.exit(f"No PDFs found in {p}")

    print(f"Parsing {len(pdfs)} PDF(s)...\n")

    all_rows, all_warnings = [], []
    for pdf in pdfs:
        try:
            rows, warns = parse_chapter_pdf(pdf, debug=args.debug)
            all_rows.extend(rows)
            all_warnings.extend(warns)
            print(f"  {pdf.name:<34} {len(rows):>6} items")
        except Exception as e:
            print(f"  {pdf.name:<34} FAILED: {e}")
            all_warnings.append(f"{pdf.name}: {e}")

    if not all_rows:
        sys.exit("\nNo tariff items extracted. Run with --debug to inspect rows.")

    print(f"\nTotal extracted: {len(all_rows)} tariff items")

    problems = validate(all_rows)
    if problems:
        print(f"\n{len(problems)} validation problem(s) — first 20:")
        for pr in problems[:20]:
            print(f"  ! {pr}")
        if len(problems) > 20:
            print(f"  ... and {len(problems) - 20} more")
    else:
        print("\nValidation: clean")

    found = {r["cth"] for r in all_rows}
    print("\nSpot checks against assessed BEs:")
    for cth in SPOT_CHECKS:
        mark = "OK     " if cth in found else "MISSING"
        print(f"  {mark} {cth}")

    write_xlsx(all_rows, args.out)
    print(f"\nWritten: {args.out}")
    print("\nREMINDER: BCD_Statutory is the First Schedule rate, NOT the")
    print("effective filing rate. Do not load it into the Duty tab's BCD_% column.")


if __name__ == "__main__":
    main()

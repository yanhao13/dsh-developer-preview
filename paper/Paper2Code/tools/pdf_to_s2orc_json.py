"""Convert a paper PDF into an S2ORC-like JSON for the PaperCoder pipeline.

The official pipeline expects the JSON produced by s2orc-doc2json/Grobid. That
service is a heavy Java dependency; the PaperCoder stages only embed the JSON
text into prompts, so a faithful S2ORC-shaped JSON built with pypdf is a
drop-in replacement.

Usage:
    python tools/pdf_to_s2orc_json.py --pdf_path paper.pdf \
        --output_json_path examples/paper.json --paper_id <id>
"""
import argparse
import json
import re

from pypdf import PdfReader

SECTION_RE = re.compile(r"^\s*(\d+(?:\.\d+)*)\.\s+([A-Z][A-Za-z0-9 ,&:/\-]{1,90})$")
APPENDIX_RE = re.compile(r"^\s*([A-Z])\.\s+([A-Z][A-Za-z0-9 ,&:/\-]{1,90})$")
UNNUMBERED_RE = re.compile(r"^\s*(Abstract|Contents|References|Acknowledgments?|Conclusion|Appendix)\s*$", re.I)
PAGE_NUM_RE = re.compile(r"^\s*\d{1,3}\s*$")
TERMINAL_END = re.compile(r"[.!?:]$")


def starts_paragraph(line: str) -> bool:
    """Heuristic: a line opens a new paragraph when it begins with a capital,
    bullet, or list number."""
    stripped = line.strip()
    if not stripped:
        return False
    return (
        stripped[0].isupper()
        or stripped.startswith(("•", "-", "–", "("))
        or re.match(r"^\d{1,2}[.)]\s", stripped)
        or stripped.startswith("[")  # citation lead lines
    )


def is_heading(line: str):
    """Return (section, sec_num) when the line is a section heading."""
    m = SECTION_RE.match(line)
    if m:
        return m.group(2), m.group(1)
    m = APPENDIX_RE.match(line)
    if m:
        return m.group(2), m.group(1)
    m = UNNUMBERED_RE.match(line)
    if m:
        name = m.group(1)
        if name.lower() in ("abstract", "contents", "references", "acknowledgment", "acknowledgments", "appendix"):
            return name, ""
    return None


def normalize(line: str) -> str:
    """Join hyphenated line wraps and collapse stray whitespace."""
    line = line.strip()
    line = re.sub(r"\s+", " ", line)
    line = line.replace("- ", "")  # de-hyphenate "com -\nposability" wraps
    return line


def main(args):
    reader = PdfReader(args.pdf_path)
    pages = [page.extract_text() or "" for page in reader.pages]

    title = (reader.metadata.title or "").strip() or pages[0].strip().split("\n")[0].strip()
    abstract = ""
    body_text = []
    back_matter = ""

    # Page 1: title/authors/abstract. Abstract spans from the "Abstract" heading
    # to the trailing page number.
    first = pages[0]
    m = re.search(r"\nAbstract\s*\n(.*)$", first, re.S)
    if m:
        abstract = re.sub(r"\n\d{1,3}\s*$", "", m.group(1)).strip()
        abstract = " ".join(normalize(l) for l in abstract.split("\n") if l.strip())

    current_section = "Introduction"
    current_sec_num = ""
    current_para: list[str] = []

    def flush_para():
        nonlocal current_para
        if current_para:
            text = " ".join(current_para).strip()
            if text:
                body_text.append({
                    "text": text,
                    "section": current_section,
                    "sec_num": current_sec_num,
                })
        current_para = []

    references_seen = False
    in_toc = False

    for page in pages[1:]:
        lines = page.split("\n")
        for raw in lines:
            if not raw.strip() or PAGE_NUM_RE.match(raw):
                continue
            line = raw.strip()
            heading = is_heading(raw)
            if heading:
                flush_para()
                name, num = heading
                if name.lower() == "contents":
                    in_toc = True  # drop the table of contents until section 1
                    continue
                if in_toc and not num:
                    continue  # unnumbered headings still inside the TOC
                in_toc = False
                if name.lower() in ("references", "acknowledgment", "acknowledgments"):
                    references_seen = True
                    current_section = "References"
                    current_sec_num = ""
                    continue
                current_section = name
                current_sec_num = num
                continue
            if in_toc:
                continue  # skip TOC entry lines
            if references_seen:
                back_matter += " " + normalize(line)
                continue
            if starts_paragraph(raw) and current_para and TERMINAL_END.search(current_para[-1]):
                flush_para()
            current_para.append(normalize(line))
        flush_para()

    out = {
        "paper_id": args.paper_id,
        "title": title,
        "abstract": abstract,
        "pdf_parse": {
            "paper_id": args.paper_id,
            "abstract": abstract,
            "body_text": body_text,
            "back_matter": back_matter.strip(),
            "ref_entries": {},
        },
    }

    with open(args.output_json_path, "w") as f:
        json.dump(out, f, indent=2)

    n_paras = len(body_text)
    n_chars = sum(len(e["text"]) for e in body_text)
    sections = sorted({e["section"] for e in body_text})
    print(f"[SAVED] {args.output_json_path}")
    print(f"[STATS] paragraphs={n_paras} chars={n_chars} sections={len(sections)}")
    print(f"[SECTIONS] {sections[:40]}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf_path", type=str, required=True)
    parser.add_argument("--output_json_path", type=str, required=True)
    parser.add_argument("--paper_id", type=str, default="paper")
    args = parser.parse_args()
    main(args)

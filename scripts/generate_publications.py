import argparse
import re
from pathlib import Path
from typing import Dict, List


ROOT = Path(__file__).resolve().parents[1]
BIB_PATH = ROOT / "my_papers_20241007_bold.bib"
HTML_PATH = ROOT / "index.html"


def split_entries(text: str) -> List[str]:
    entries = []
    i = 0
    n = len(text)
    while i < n:
        if text[i] != "@":
            i += 1
            continue
        j = i + 1
        while j < n and text[j].isspace():
            j += 1
        while j < n and (text[j].isalpha() or text[j] in ["@"]):
            j += 1
        while j < n and text[j] != "{":
            j += 1
        if j >= n:
            break
        depth = 0
        k = j
        while k < n:
            if text[k] == "{":
                depth += 1
            elif text[k] == "}":
                depth -= 1
                if depth == 0:
                    k += 1
                    break
            k += 1
        if depth == 0:
            entries.append(text[i:k])
            i = k
        else:
            break
    return entries


def split_fields(body: str) -> List[str]:
    fields = []
    current = []
    depth = 0
    in_quote = False
    escape = False
    for ch in body:
        if escape:
            current.append(ch)
            escape = False
            continue
        if ch == "\\":
            current.append(ch)
            escape = True
            continue
        if ch == '"' and depth == 0:
            in_quote = not in_quote
            current.append(ch)
            continue
        if ch == "{" and not in_quote:
            depth += 1
            current.append(ch)
            continue
        if ch == "}" and not in_quote:
            depth -= 1
            current.append(ch)
            continue
        if ch == "," and depth == 0 and not in_quote:
            field = "".join(current).strip()
            if field:
                fields.append(field)
            current = []
            continue
        current.append(ch)
    tail = "".join(current).strip()
    if tail:
        fields.append(tail)
    return fields


def unbrace(value: str) -> str:
    value = value.strip()
    if value.startswith("{") and value.endswith("}"):
        value = value[1:-1]
    if value.startswith('"') and value.endswith('"'):
        value = value[1:-1]
    return value.strip()


def _decode_latex_accents(text: str) -> str:
    accent_map = {
        "'": {
            "a": "á",
            "e": "é",
            "i": "í",
            "o": "ó",
            "u": "ú",
            "A": "Á",
            "E": "É",
            "I": "Í",
            "O": "Ó",
            "U": "Ú",
        },
        "`": {
            "a": "à",
            "e": "è",
            "i": "ì",
            "o": "ò",
            "u": "ù",
            "A": "À",
            "E": "È",
            "I": "Ì",
            "O": "Ò",
            "U": "Ù",
        },
        "^": {
            "a": "â",
            "e": "ê",
            "i": "î",
            "o": "ô",
            "u": "û",
            "A": "Â",
            "E": "Ê",
            "I": "Î",
            "O": "Ô",
            "U": "Û",
        },
        "~": {
            "a": "ã",
            "n": "ñ",
            "o": "õ",
            "A": "Ã",
            "N": "Ñ",
            "O": "Õ",
        },
        "\"": {
            "a": "ä",
            "e": "ë",
            "i": "ï",
            "o": "ö",
            "u": "ü",
            "A": "Ä",
            "E": "Ë",
            "I": "Ï",
            "O": "Ö",
            "U": "Ü",
        },
    }

    def replace_accent(match) -> str:
        accent = match.group(1)
        char = match.group(2)
        return accent_map.get(accent, {}).get(char, match.group(0))

    # Handle forms like {\'{e}}, \'{e}, \'{e}, \'e
    text = re.sub(r"\{?\\([`'^~\"]) *\{?([A-Za-z])\}?\}?", replace_accent, text)
    text = re.sub(r"\\c\{?([cC])\}?", lambda m: "ç" if m.group(1) == "c" else "Ç", text)
    return text


def cleanup_latex(text: str) -> str:
    if not text:
        return text
    text = _decode_latex_accents(text)
    text = re.sub(r"\\textbf\{([^}]*)\}", r"\1", text)
    text = text.replace(r"\&", "&")
    text = re.sub(r"[{}]", "", text)
    text = re.sub(r"\s+", " ", text).strip()

    replacements = {
        "Ã©": "é",
        "Ã¨": "è",
        "Ã¡": "á",
        "Ã¢": "â",
        "Ã£": "ã",
        "Ã³": "ó",
        "Ã´": "ô",
        "Ãº": "ú",
        "Ã±": "ñ",
        "Ã§": "ç",
        "Ã­": "í",
        "Ãœ": "Ü",
        "Ã–": "Ö",
        "Ã“": "Ó",
        "Ã‰": "É",
        "â€“": "–",
        "â€”": "—",
        "â€œ": "“",
        "â€�": "”",
        "â€™": "’",
        "â€˜": "‘",
        "Â ": " ",
        "Â±": "±",
        "Â°": "°",
        "Â·": "·",
    }
    for bad, good in replacements.items():
        text = text.replace(bad, good)

    return text.replace("?", "").strip()


def parse_author(author_field: str) -> str:
    if not author_field:
        return ""
    author_field = cleanup_latex(author_field)
    parts = [p.strip() for p in author_field.split(" and ") if p.strip()]
    if not parts:
        return ""
    first = parts[0]
    if "," in first:
        last, first_name = [x.strip() for x in first.split(",", 1)]
    else:
        bits = first.split()
        last = bits[-1] if bits else ""
        first_name = bits[0] if bits else ""
    if last and first_name:
        return f"{last}, {first_name}"
    return last or first_name


def parse_bib_entry(raw: str) -> Dict[str, str]:
    head_start = raw.find("{")
    head_end = raw.rfind("}")
    if head_start == -1 or head_end == -1:
        return {}
    body = raw[head_start + 1 : head_end].strip()
    comma_idx = body.find(",")
    if comma_idx == -1:
        return {}
    body_fields = body[comma_idx + 1 :]
    fields = split_fields(body_fields)

    data = {}
    for field in fields:
        if "=" not in field:
            continue
        key, val = field.split("=", 1)
        data[key.strip().lower()] = unbrace(val)

    title = cleanup_latex(data.get("title", ""))
    year = data.get("year", "")
    date = data.get("date", "")
    journal = cleanup_latex(data.get("journal", ""))
    doi = data.get("doi", "")
    author = parse_author(data.get("author", ""))

    if not year and date:
        match = re.search(r"\d{4}", date)
        if match:
            year = match.group(0)

    if not title or not year:
        return {}

    try:
        year_int = int(re.findall(r"\d{4}", year)[0])
    except Exception:
        year_int = 0

    doi_url = f"https://doi.org/{doi}" if doi else ""

    return {
        "year": year_int,
        "title": title,
        "journal": journal,
        "doi_url": doi_url,
        "author": author,
    }


def build_publications(entries: List[Dict[str, str]]) -> str:
    by_year: Dict[int, List[Dict[str, str]]] = {}
    for entry in entries:
        by_year.setdefault(entry["year"], []).append(entry)

    blocks = []
    for year in sorted(by_year.keys(), reverse=True):
        items = []
        for entry in by_year[year]:
            line = (
                f"{entry['author']}; et al. ({year}). "
                f"<span class=\"pub-title\">{entry['title']}</span>"
            )
            if entry["journal"]:
                line += f". <span class=\"pub-journal\">{entry['journal']}</span>"
            if entry["doi_url"]:
                line += (
                    f". DOI: <a href=\"{entry['doi_url']}\" target=\"_blank\" "
                    f"rel=\"noopener\">{entry['doi_url']}</a>"
                )
            line += "."

            items.append(
                "          <li>\n"
                f"            <span class=\"list-title\">{line}</span>\n"
                "          </li>"
            )

        block = (
            "        <div class=\"pub-year\">\n"
            f"          <h3>{year}</h3>\n"
            "          <ul class=\"list\">\n"
            + "\n".join(items)
            + "\n          </ul>\n"
            "        </div>"
        )
        blocks.append(block)

    return "\n".join(blocks)


def _replace_between_markers(html: str, new_section: str) -> str:
    start_marker = "<!-- PUBS_START -->"
    end_marker = "<!-- PUBS_END -->"
    start_idx = html.find(start_marker)
    end_idx = html.find(end_marker)
    if start_idx == -1 or end_idx == -1 or end_idx < start_idx:
        raise SystemExit("PUBS_START/END markers not found in HTML.")
    return html[: start_idx + len(start_marker)] + "\n" + new_section + "\n        " + html[end_idx:]


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate publications HTML from a BibTeX file.")
    parser.add_argument("--bib", type=Path, default=BIB_PATH, help="Path to BibTeX file.")
    parser.add_argument("--html", type=Path, default=HTML_PATH, help="Path to HTML template.")
    parser.add_argument("--output", type=Path, default=HTML_PATH, help="Output HTML path.")
    args = parser.parse_args()

    if not args.bib.exists():
        raise SystemExit(f"BibTeX file not found: {args.bib}")
    if not args.html.exists():
        raise SystemExit(f"HTML file not found: {args.html}")

    text = args.bib.read_text(encoding="utf-8", errors="replace")
    entries_raw = split_entries(text)
    parsed = []
    for raw in entries_raw:
        entry = parse_bib_entry(raw)
        if entry:
            parsed.append(entry)

    parsed.sort(key=lambda e: (e["year"], e["author"], e["title"]), reverse=True)

    new_section = build_publications(parsed)

    html = args.html.read_text(encoding="utf-8", errors="replace")
    updated = _replace_between_markers(html, new_section)
    args.output.write_text(updated, encoding="utf-8")

    print(f"Updated publications list with {len(parsed)} items.")


if __name__ == "__main__":
    main()

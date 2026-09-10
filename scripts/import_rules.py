#!/usr/bin/env python3
"""Turn the SRD's own RTF releases into data/rules.json, the rules reference.

The tables come from the web mirror, which the rest of the pipeline parses.
The *prose* comes from here: the documents Wizards released, each of which
opens by declaring itself Open Game Content under the Open Game License v1.0a.

    pandoc must be installed, and the documents downloaded:
    python3 scripts/import_rules.py ~/Downloads/d20modernsrd

Only regenerating needs pandoc. The output is committed, so building the packs
does not.

The RTF styling is inconsistent — these are twenty-year-old Word files, and the
same kind of heading is an h1 in one document, an h5 in the next, and a bold
paragraph in the one after that. So the section level is chosen per document by
what it produces rather than by trusting the level itself.
"""
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The books, in the order a reader would meet them.
BOOKS = [
    ("Modern", "d20 Modern"),
    ("Arcana", "Urban Arcana"),
    ("Future", "d20 Future"),
    ("Menaces", "Menace Manual"),
]

# A page bigger than this is worth splitting further if the document offers a
# deeper heading level to split on.
MAX_PAGE_BYTES = 25_000

# Below this, a level's headings are repeated boilerplate rather than section
# names: d20 Future's advanced classes are twelve "Requirements" and twelve
# "Class Features" at one level and the class names at another.
MIN_UNIQUE_NAMES = 0.6

HEADING = re.compile(r"<h([1-6])[^>]*>(.*?)</h\1>", re.S)


def convert(path: str) -> str:
    """One RTF as HTML, by way of pandoc."""
    result = subprocess.run(
        ["pandoc", "-f", "rtf", "-t", "html", path],
        capture_output=True, text=True, check=True,
    )
    return result.stdout


def tidy(markup: str) -> str:
    """Pandoc's output, with the artefacts of a Word table taken out.

    A heading inside a table cell is a column header - "Magic Bullet Type",
    "Effect" - and reading it as a section put three of them in the middle of
    the spell list. The odd/even row classes are pandoc's own striping, which
    Foundry styles for itself.
    """
    markup = re.sub(r"(<td[^>]*>)\s*<h[1-6][^>]*>(.*?)</h[1-6]>",
                    r"\1<strong>\2</strong>", markup, flags=re.S)
    markup = re.sub(r'\s+class="(?:odd|even|heading)"', "", markup)
    return markup.strip()


# "ALIEN PROBE", "GREATER SPELL FOCUS": a name the RTF set in capitals as body
# text rather than as a heading. Bounded so a sentence in capitals is not one.
CAPS_PARAGRAPH = re.compile(r"<p>([A-Z][A-Z0-9 ,\'’\-()/&.]{3,48})</p>")


def promote_caps(markup: str) -> str:
    """All-caps paragraphs as the headings they are, outside tables.

    These documents style the same kind of name three ways: the Menace
    Manual's creature entries are an h2 for the acid rainer and a plain
    paragraph for the alien probe two pages later. Promoting the paragraphs is
    what puts one creature on one page.

    Never inside a table, where a capitalised cell is a column header.
    """
    def promote(chunk):
        def replace(match):
            text = match.group(1).strip()
            if text.endswith(".") or len(text.split()) > 6:
                return match.group(0)
            return f"<h2>{text}</h2>"
        return CAPS_PARAGRAPH.sub(replace, chunk)

    out, cursor = [], 0
    for table in re.finditer(r"<table.*?</table>", markup, flags=re.S):
        out.append(promote(markup[cursor:table.start()]))
        out.append(table.group(0))
        cursor = table.end()
    out.append(promote(markup[cursor:]))
    return "".join(out)


def headings(markup: str) -> list[tuple[int, str, int]]:
    """Every heading as (level, text, position)."""
    found = []
    for match in HEADING.finditer(markup):
        text = html.unescape(re.sub(r"<[^>]+>", "", match.group(2))).strip()
        text = re.sub(r"\s+", " ", text)
        if text:
            found.append((int(match.group(1)), text, match.start()))
    return found


def split_level(markup: str, found: list[tuple[int, str, int]]) -> int | None:
    """Which heading level to break this document into pages at.

    The shallowest level that gives more than one page, names them distinctly,
    and does not leave a page too long to read. Failing all of that, the level
    that at least gives the most pages.
    """
    candidates = []
    for level in sorted({level for level, _, _ in found}):
        marks = [position for candidate, _, position in found if candidate == level]
        if len(marks) < 2:
            continue
        names = [text for candidate, text, _ in found if candidate == level]
        unique = len(set(names)) / len(names)
        largest = max(
            (marks[i + 1] if i + 1 < len(marks) else len(markup)) - marks[i]
            for i in range(len(marks))
        )
        candidates.append((level, unique, largest, len(marks)))

    for level, unique, largest, _ in candidates:
        if unique >= MIN_UNIQUE_NAMES and largest <= MAX_PAGE_BYTES:
            return level
    for level, unique, _, _ in candidates:
        if unique >= MIN_UNIQUE_NAMES:
            return level
    return candidates[0][0] if candidates else None


def largest_page(markup: str, found, level) -> int:
    """The longest run between two headings of the chosen level."""
    marks = [position for candidate, _, position in found if candidate == level]
    if not marks:
        return len(markup)
    return max((marks[i + 1] if i + 1 < len(marks) else len(markup)) - marks[i]
               for i in range(len(marks)))


def text_of(markup: str) -> str:
    """The visible text of a fragment, for judging whether it says anything."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", markup))).strip()


def pages_of(markup: str, title: str) -> list[dict]:
    """One document as the pages of a journal entry.

    A few of these files carry their sections as bold body text rather than as
    headings, and promoting those was tried: it doubled the page count and
    multiplied the duplicate page names by ten, because a bold cell in a table
    is a column header. A long page is searchable; a contents list full of
    pages called "DC" and "Size" is not.
    """
    pages = split_pages(markup, title)

    # Promoting the capitalised paragraphs is kept only where it actually
    # improves the split. It turns the Menace Manual's A-I creatures from 14
    # pages into 34, one per creature, and Urban Arcana's feats from 4 into 27
    # - but on Shadowkind it shifts the level the document is broken at and
    # loses ten of the species, so there it is thrown away.
    promoted = split_pages(promote_caps(markup), title)
    if len(promoted) > len(pages) and duplicate_names(promoted) <= duplicate_names(pages):
        return promoted
    return pages


def duplicate_names(pages: list[dict]) -> int:
    """How many pages repeat a name another page already used."""
    return len(pages) - len({page["name"] for page in pages})


def split_pages(markup: str, title: str) -> list[dict]:
    """The pages one document's headings divide it into."""
    found = headings(markup)
    level = split_level(markup, found)
    if level is None:
        return [{"name": title, "html": markup}]

    marks = [(text, position) for candidate, text, position in found if candidate == level]
    pages = []
    for index, (name, start) in enumerate(marks):
        end = marks[index + 1][1] if index + 1 < len(marks) else len(markup)
        pages.append({"name": readable(name), "html": markup[start:end].strip()})

    # Anything before the first section - an introduction, the Open Game
    # Content notice - belongs to the document rather than to a section.
    preamble = markup[:marks[0][1]].strip()
    if len(text_of(preamble)) > 40:
        pages.insert(0, {"name": "Overview", "html": preamble})

    # Several documents print their own title at the same level as their
    # sections, which leaves a page holding nothing but that title. The entry
    # is already called that.
    return [page for page in pages if len(text_of(page["html"])) > len(page["name"]) + 4]


# Words the SRD sets in capitals because they are capitals, not because the
# heading is: a contents list of "Fx Basics" and "Dc Modifiers" reads worse
# than the capitals it replaced.
ACRONYMS = {"FX", "DC", "DCS", "HP", "AP", "PL", "GM", "GMS", "NPC", "NPCS",
            "SRD", "XP", "AC", "II", "III", "IV", "I", "A-I", "J-Z", "OGL"}

# Small words a title leaves alone unless they open it.
MINOR_WORDS = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "of",
               "on", "or", "the", "to", "with"}


def readable(name: str) -> str:
    """The SRD sets its headings in capitals; a contents list reads better not.

    Title case, except for the words that are capitals in their own right and
    the small words a title leaves alone: "FX BASICS" is FX Basics, and
    "DEATH, DYING, AND HEALING" is Death, Dying, and Healing.
    """
    if not name.isupper():
        return name

    words = name.split()
    out = []
    for index, word in enumerate(words):
        bare = word.strip("(),.:;").upper()
        if bare in ACRONYMS:
            out.append(word)
        elif index and word.lower().strip(",") in MINOR_WORDS:
            out.append(word.lower())
        else:
            out.append(word.title())
    return " ".join(out)


def title_of(path: str, markup: str, overrides: dict) -> str:
    """What to call the entry.

    The file name is the SRD's own, and it is one lowercase run -
    "msrdequipmentweaponsandarmor" - so it cannot be split back into words.
    The title comes from the document, and the handful whose first heading is
    a section rather than a title are named in data/overrides/rules.json.
    """
    key = os.path.splitext(os.path.basename(path))[0]
    if key in overrides:
        return overrides[key]["title"]
    found = headings(markup)
    return readable(found[0][1]) if found else key


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="the directory holding Modern/, Arcana/, Future/, Menaces/")
    args = parser.parse_args()

    if not shutil.which("pandoc"):
        print("pandoc is needed to read the RTF; data/rules.json is committed "
              "so this is only for regenerating it", file=sys.stderr)
        return 1

    override_path = os.path.join(ROOT, "data", "overrides", "rules.json")
    overrides = {}
    if os.path.exists(override_path):
        overrides = {k: v for k, v in json.load(open(override_path, encoding="utf-8")).items()
                     if not k.startswith("_")}

    documents = []
    for folder, book in BOOKS:
        directory = os.path.join(args.source, folder)
        if not os.path.isdir(directory):
            print(f"  ! no {folder}/ in {args.source}", file=sys.stderr)
            continue

        for name in sorted(os.listdir(directory)):
            if not name.lower().endswith(".rtf"):
                continue
            path = os.path.join(directory, name)
            markup = tidy(convert(path))
            title = title_of(path, markup, overrides)
            pages = pages_of(markup, title)
            documents.append({
                "id": os.path.splitext(name)[0],
                "book": book,
                "title": title,
                "source": name,
                "pages": pages,
            })
            print(f"  {book:14} {os.path.splitext(name)[0]:42} {len(pages):3} pages")

    out = os.path.join(ROOT, "data", "rules.json")
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(documents, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    pages = sum(len(entry["pages"]) for entry in documents)
    print(f"\ndata/rules.json: {len(documents)} documents, {pages} pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())

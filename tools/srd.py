"""Shared helpers for reading the d20 Modern SRD.

Pages are fetched once into .cache/ and parsed from there, so re-running the
pipeline after a schema change costs nothing and does not re-hit the site.
Standard library only: no install step.
"""
from __future__ import annotations

import hashlib
import html
import os
import re
import time
import urllib.request
from html.parser import HTMLParser

BASE = "https://spellbooksoftware.com/d20mrsd/"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".cache")
DATA = os.path.join(ROOT, "data")

USER_AGENT = "modern20-foundry-system/0.1 (SRD import; contact via repository)"
POLITE_DELAY = 1.0

# The SRD pages this pipeline reads, by the dataset each one produces.
PAGES = {
    "legal": "legal.html",
    "basics": "basics.html",
    "abilities": "abilityscores.html",
    "allegiances": "allegiances.html",
    "basic_classes": "basicclasses.html",
    "occupations": "occupations.html",
    # skills.html is the section index; skillsorder.html carries the entries.
    "skills": "skillsorder.html",
    "feats": "feats.html",
    "wealth": "wealth.html",
    "equipment": "equipment.html",
    "combat": "combat.html",
    "conditions": "conditionsummary.html",
    "advanced_classes": "advancedclasses.html",
    "ordinaries": "ordinaries.html",
    "creatures": "creatures.html",
    "environment": "environmentandhazards.html",
    "fx": "fxbasics.html",
    "urban_arcana": "arcana.html",
    "future": "future.html",
    "menace": "menace.html",
}


def decode(raw: bytes) -> str:
    """Decode SRD bytes. These pages are Windows-1252, not UTF-8: they use
    smart quotes and en dashes that decode to replacement characters otherwise."""
    match = re.search(rb'charset=["\']?([\w-]+)', raw[:4096], re.I)
    declared = match.group(1).decode("ascii", "replace").lower() if match else ""
    for encoding in (declared, "cp1252", "utf-8"):
        if not encoding:
            continue
        try:
            return raw.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode("cp1252", errors="replace")


def fetch(page: str, *, refresh: bool = False) -> str:
    """Return a page's HTML, reading from .cache/ unless refresh is asked for."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, page)

    if os.path.exists(path) and not refresh:
        return open(path, encoding="utf-8", errors="replace").read()

    request = urllib.request.Request(BASE + page, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read()

    text = decode(raw)
    open(path, "w", encoding="utf-8").write(text)
    time.sleep(POLITE_DELAY)
    return text


class TableParser(HTMLParser):
    """Collect every <table> on a page, at any nesting depth.

    Cell markup carries the SRD's row hierarchy, so it is kept rather than
    flattened: in the equipment tables a bold full-width cell is a category
    banner, an italic one names a product whose variants follow, and those
    variants are marked with class="indent". Losing that turns
    "Aluminum travel case / 10 lb. Capacity" into an item called "10 lb. Capacity".
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables: list[list[dict]] = []
        self._tables: list[list[dict]] = []
        self._rows: list[list[dict]] = []
        self._cell: list[str] | None = None
        self._cell_meta: dict | None = None
        self._emphasis: list[str] = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "table":
            self._tables.append([])
        elif tag == "tr" and self._tables:
            self._rows.append([])
        elif tag in ("td", "th") and self._tables:
            self._cell = []
            self._emphasis = []
            self._cell_meta = {
                "indent": "indent" in (attributes.get("class") or ""),
                "colspan": int(attributes.get("colspan") or 1),
                "header": tag == "th",
            }
        elif tag in ("b", "strong", "i", "em") and self._cell is not None:
            self._emphasis.append("bold" if tag in ("b", "strong") else "italic")
        elif tag == "br" and self._cell is not None:
            self._cell.append(" ")

    def handle_endtag(self, tag):
        if tag == "table" and self._tables:
            finished = self._tables.pop()
            if finished:
                self.tables.append(finished)
        elif tag == "tr" and self._rows:
            row = self._rows.pop()
            if row and self._tables:
                self._tables[-1].append(row)
        elif tag in ("td", "th"):
            if self._cell is not None and self._rows:
                meta = self._cell_meta or {}
                meta["text"] = clean(" ".join(self._cell))
                meta["bold"] = "bold" in self._emphasis
                meta["italic"] = "italic" in self._emphasis
                self._rows[-1].append(meta)
            self._cell = None
            self._cell_meta = None
            self._emphasis = []

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def classify_row(row: list[dict]) -> str:
    """How a table row functions: a banner, a product heading, or a data row."""
    populated = [c for c in row if c["text"]]
    if not populated:
        return "blank"
    if all(c.get("header") for c in row):
        return "header"
    # A single full-width cell is a banner; emphasis says which level.
    if len(populated) == 1 and (len(row) == 1 or populated[0].get("colspan", 1) > 1):
        if populated[0].get("italic"):
            return "parent"
        return "category"
    if row[0].get("indent"):
        return "variant"
    return "item"


def tables(page_html: str) -> list[list[list[str]]]:
    """Every table as plain rows of cell text."""
    return [[[c["text"] for c in row] for row in table] for table in rich_tables(page_html)]


def rich_tables(page_html: str) -> list[list[list[dict]]]:
    parser = TableParser()
    parser.feed(page_html)
    return parser.tables


def annotated_tables(page_html: str, *, min_rows: int = 3, min_cols: int = 2):
    """Data tables as {"header": [...], "rows": [...], "kinds": [...]}."""
    out = []
    for table in rich_tables(page_html):
        text = [[c["text"] for c in row] for row in table]
        if len(text) < min_rows or max(len(r) for r in text) < min_cols:
            continue
        kinds = [classify_row(row) for row in table]

        # A table may open with a category banner, putting the real header on
        # the second row - which is how the explosives table hid from a filter
        # looking for "Purchase DC" in the header.
        head = 0
        while head < len(kinds) - 1 and kinds[head] in ("category", "parent", "blank"):
            if kinds[head + 1] == "header":
                head += 1
                break
            head += 1

        out.append({
            "header": text[head],
            "rows": text[head + 1:],
            "kinds": kinds[head + 1:],
        })
    return out



def data_tables(page_html: str, *, min_rows: int = 3, min_cols: int = 2):
    """Tables that look like data rather than page layout, as rows of text."""
    result = []
    for table in tables(page_html):
        if len(table) < min_rows:
            continue
        if max(len(row) for row in table) < min_cols:
            continue
        result.append(table)
    return result


def find_table(page_html: str, *headers: str):
    """The first data table whose header row mentions all the given headers."""
    wanted = [h.lower() for h in headers]
    for table in data_tables(page_html):
        head = " ".join(table[0]).lower()
        if all(w in head for w in wanted):
            return table
    return None


def clean(text: str) -> str:
    """Normalize SRD cell text: unescape entities, collapse whitespace."""
    text = html.unescape(text)
    text = text.replace(" ", " ").replace("—", "-").replace("–", "-")
    return re.sub(r"\s+", " ", text).strip()


def to_int(text: str, default: int = 0) -> int:
    """Pull the first signed integer out of a cell, e.g. '+2' or '-1 (see text)'."""
    match = re.search(r"[-+]?\d+", text or "")
    return int(match.group()) if match else default


# The SRD's own size column: the modifier a creature of each size takes on its
# Defense and on its attack rolls, which are the same number — "A creature's
# size modifier applies to its attack rolls and to its Defense."
#
# Kept here because three scripts and config.mjs all need it, and the one time
# it was written out twice the two copies disagreed: the scraper folded the
# size modifier into a creature's Defense offset while the sheet added it
# again, so 183 of 300 creatures showed a Defense the book does not print.
# check_config.py holds this table and config.mjs to each other.
SIZE_MODIFIER = {
    "fine": 8, "diminutive": 4, "tiny": 2, "small": 1, "medium": 0,
    "large": -1, "huge": -2, "gargantuan": -4, "colossal": -8,
}


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "unnamed"


def document_id(pack: str, slug: str) -> str:
    """A stable 16-character Foundry id, so rebuilds update rather than duplicate.

    Shared rather than private to the importer: a link into the rules
    compendium is a UUID made of these ids, and the two have to agree or every
    link points at a page that does not exist.
    """
    digest = hashlib.sha1(f"{pack}/{slug}".encode()).hexdigest()
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    value = int(digest, 16)
    out = []
    for _ in range(16):
        value, index = divmod(value, len(alphabet))
        out.append(alphabet[index])
    return "".join(out)


def page_url(page: str) -> str:
    return BASE + page


LINK = re.compile(r"""href=["']([^"'#?]+\.html?)["']""", re.I)

# Pages that appear in every sidebar and carry no content of their own.
CHROME = {"srdhome.html", "index.html", "skills.html"}

# Content pages that sit deeper than the crawl reaches. Psionic powers are four
# hops from the index (srdhome -> fxbasics -> fxspells -> fxpsionics -> fxpowers),
# and crawling that deep to find two pages would fetch most of the site again.
DEEP_PAGES = [
    "fxpowers.html", "urbanpsidesc.html",
    # Urban Arcana's creatures, four hops from the index (srdhome -> arcana ->
    # urbanmonst -> urbanmonstaz -> urbanmonst1). Every one of its sixty-five
    # creatures was missing from the compendium for that one hop: the stat
    # blocks are the same label/value tables the parser already reads, and it
    # had simply never been shown them.
    "urbanmonst1.html", "urbanmonst2.html", "urbanmonst3.html", "urbanmonst4.html",
]


def links(page_html: str) -> list[str]:
    """Same-directory page links, de-duplicated, in document order."""
    out = []
    for href in LINK.findall(page_html):
        name = href.split("/")[-1]
        if name and name not in out:
            out.append(name)
    return out


def crawl(start: str = "srdhome.html", depth: int = 2, *, refresh: bool = False) -> list[str]:
    """Every SRD page reachable from the index within `depth` hops.

    The SRD is a two-level tree: section pages link to the sub-pages that hold
    the actual tables (equipment.html -> weapons.html, armor.html, ...), so a
    hand-maintained page list goes stale. This finds them instead.
    """
    seen = {start}
    frontier = [start]

    for _ in range(depth):
        next_frontier = []
        for page in frontier:
            try:
                page_html = fetch(page, refresh=refresh)
            except Exception:
                continue
            for name in links(page_html):
                if name in seen or name in CHROME:
                    continue
                seen.add(name)
                next_frontier.append(name)
        frontier = next_frontier

    for page in DEEP_PAGES:
        seen.add(page)

    return sorted(seen)

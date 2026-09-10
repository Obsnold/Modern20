#!/usr/bin/env python3
"""Turn the SRD's own HTML into data/rules.json, the rules reference.

    python3 scripts/import_rules.py             # from .cache/, fetching what is missing
    python3 scripts/import_rules.py --refresh   # re-fetch every page first

This used to read the RTF releases through pandoc, and fought them the whole
way: they are twenty-year-old Word files where the same kind of heading is an
h1 in one document, an h5 in the next and a bold paragraph in the one after,
so where a page ended had to be guessed at by counting what each heading level
produced. The mirror at spellbooksoftware.com/d20mrsd is the same text already
divided into pages, with a table of contents that says what each one is called
and which book it belongs to. There is nothing left to guess.

The structure comes from the navigation menu every page carries, which is the
whole site as a tree: a cell spanning four columns is a book, three is a
section, two a page within it, one a page within that. The menu on any given
page expands that page's own branch, so reading all of them assembles the
whole thing, names included - and the names matter, because the headings
inside the pages are useless for it. Every page under d20 Future is headed
"d20 FUTURE".
"""
import argparse
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The banner each section sits under, as the book it is.
BOOKS = {
    "CORE SRD": "d20 Modern",
    "Urban Arcana": "Urban Arcana",
    "d20 Future": "d20 Future",
    "Menace": "Menace Manual",
    "Appendices": "d20 Modern",
}

# The one page in the menu that is not content: it is the table of contents,
# and the compendium's own directory does that job.
SKIP = {"srdhome.html"}

MARKER = "<!-- Main body contents -->"

# <td colspan="3"><a href="combat.html">Combat</a></td>, or the same cell
# without the link where it is the page being looked at.
NAV_CELL = re.compile(
    r'<td([^>]*)>\s*(?:<a\s+href="([^"#?]+)"[^>]*>(.*?)</a>|(.*?))\s*</td>',
    re.S | re.I)


def text_of(markup: str) -> str:
    """The visible text of a fragment, whitespace collapsed."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", markup))).strip()


def nav_rows(page_html: str) -> list[tuple[int, str | None, str]]:
    """The navigation menu as (depth, page, label), in document order.

    Depth is the cell's colspan, which is how the menu draws its indentation:
    4 is a book banner, 3 a section, 2 a page inside it, 1 a page inside that.
    The row for the page being looked at carries no link, so its page is None
    and the caller fills in the page it is reading.
    """
    start = page_html.find('id="menu"')
    end = page_html.find(MARKER)
    if start < 0 or end < 0:
        return []

    rows = []
    for match in NAV_CELL.finditer(page_html[start:end]):
        attributes, href, linked, plain = match.groups()
        label = text_of(linked if href else (plain or ""))
        if not label:
            continue
        colspan = re.search(r'colspan="(\d+)"', attributes or "")
        rows.append((int(colspan.group(1)) if colspan else 1, href, label))
    return rows


class Site:
    """The SRD as its menu describes it: pages, names, parents and books."""

    def __init__(self):
        self.label: dict[str, str] = {}
        self.parent: dict[str, str | None] = {}
        self.book: dict[str, str] = {}
        self.children: dict[str, list[str]] = {}
        self.order: list[str] = []
        # Every page's menu links to every section, so a page dropped for
        # being missing is offered again by the next menu read.
        self.missing: set[str] = set()

    def drop(self, page: str) -> None:
        """A page the menu links to and the server does not have.

        The menu offers two appendices the mirror never published, and one
        misspelt link to the Urban Arcana feats. A 404 is not a reason to stop
        importing the other two hundred and forty pages.
        """
        self.missing.add(page)
        self.label.pop(page, None)
        parent = self.parent.pop(page, None)
        self.book.pop(page, None)
        if page in self.order:
            self.order.remove(page)
        for child in self.children.pop(page, []):
            self.drop(child)
        if parent in self.children and page in self.children[parent]:
            self.children[parent].remove(page)

    def add(self, page: str, label: str, parent: str | None, book: str) -> None:
        if page in SKIP or page in self.missing:
            return
        self.label.setdefault(page, label)
        if page not in self.parent:
            self.parent[page] = parent
            self.book[page] = book
            self.order.append(page)
            siblings = self.children.setdefault(parent, [])
            if page not in siblings:
                siblings.append(page)

    def read(self, page: str, page_html: str) -> None:
        """One page's menu, merged into what is known.

        A row's parent is the last row seen one level shallower, which is what
        the indentation means. Nothing is overwritten: the first menu to
        describe a page is as good as the last, and this way the traversal can
        read them in any order.
        """
        banner, at_depth = "CORE SRD", {}
        for depth, href, label in nav_rows(page_html):
            target = href or page
            if depth >= 4:
                banner, at_depth = label, {}
                continue
            self.add(target, label, at_depth.get(depth + 1), BOOKS.get(banner, "d20 Modern"))
            at_depth[depth] = target
            # A shallower row ends any branch below it.
            for deeper in [d for d in at_depth if d < depth]:
                at_depth.pop(deeper)

    def descendants(self, page: str) -> list[str]:
        """A page and everything under it, in menu order."""
        out = [page]
        for child in self.children.get(page, []):
            out += self.descendants(child)
        return out


def read_site(refresh: bool) -> Site:
    """Walk the menu outwards from the index until it stops growing.

    Each page's menu expands its own branch and no other, so the sections are
    known after reading the index, their pages after reading the sections, and
    so on. Three passes reach the whole site; the loop stops when a pass finds
    nothing new rather than counting them.
    """
    site = Site()
    site.read("srdhome.html", srd.fetch("srdhome.html", refresh=refresh))

    read: set[str] = set()
    while True:
        pending = [page for page in site.order if page not in read]
        if not pending:
            return site
        for page in pending:
            read.add(page)
            try:
                site.read(page, srd.fetch(page, refresh=refresh))
            except Exception as error:  # noqa: BLE001 - a missing page is not fatal
                print(f"  ! {page} is in the menu but not on the site ({error})",
                      file=sys.stderr)
                site.drop(page)


def body(page_html: str) -> str:
    """The content cell, which every page marks the start of.

    It ends where its own cell does, so nested tables are counted rather than
    cut at the first </td> - the SRD's pages are mostly tables.
    """
    start = page_html.find(MARKER)
    if start < 0:
        return ""
    rest = page_html[start + len(MARKER):]
    depth = 0
    for match in re.finditer(r"</?(table|td)\b", rest, re.I):
        tag = match.group(0).lower()
        if tag == "<table":
            depth += 1
        elif tag == "</table":
            depth -= 1
        elif tag == "</td" and depth <= 0:
            return rest[:match.start()].strip()
    return rest.strip()


# A table whose only job is to draw a line under a heading, and the empty one
# every page ends with. Both are layout the SRD's own stylesheet supplies and
# Foundry does not.
RULE_TABLE = re.compile(
    r'<table[^>]*>(?:(?!</table>).)*?background="underline\.gif".*?</table>', re.S | re.I)
SPACER_TABLE = re.compile(
    r'<table[^>]*>\s*<tbody>\s*<tr>\s*<td[^>]*>\s*(?:<br\s*/?>|&nbsp;|\s)*\s*</td>\s*</tr>\s*</tbody>\s*</table>',
    re.S | re.I)


# The mirror's maintainer signs off at the foot of a hundred and forty-eight
# pages, asking for reports of typos and broken links. It is his page
# furniture, not the SRD's text, and it carries his e-mail address, which has
# no business being shipped inside a compendium.
CREDIT = re.compile(
    r"(?:<br\s*/?>\s*)*<p>\s*<i>\s*Questions\?.*?</a>\s*(?:</p>)?", re.S | re.I)


CELL_OR_HEADING = re.compile(r"</?t[dh]\b[^>]*>|</?h[1-6][^>]*>", re.I)


def unhead_cells(markup: str) -> str:
    """Headings inside a table cell, as the emphasis they actually are.

    A heading in a cell is never a section. Sometimes it is a column header,
    which is what put three of them in the middle of the spell list when the
    RTFs were the source; here it is more often a letter dividing an
    alphabetical index - <h3>I</h3> above the invisible stalker - laid out in
    columns. Either way a document outline built from them is nonsense, so
    they become <strong>.

    Counted through the markup rather than matched cell by cell, because a
    cell holds several of these and the SRD's own tables nest.
    """
    out, cursor, depth = [], 0, 0
    for match in CELL_OR_HEADING.finditer(markup):
        tag = match.group(0)
        lowered = tag.lower()
        out.append(markup[cursor:match.start()])
        cursor = match.end()

        if lowered.startswith("</t"):
            depth = max(0, depth - 1)
            out.append(tag)
        elif lowered.startswith("<t"):
            depth += 1
            out.append(tag)
        elif depth:
            out.append("</strong>" if lowered.startswith("</h") else "<strong>")
        else:
            out.append(tag)
    out.append(markup[cursor:])
    return "".join(out)


def tidy(markup: str) -> str:
    """The page, with the mirror's own furniture taken out.

    dash.gif is a one-pixel dash in a table cell, and an image that is not
    there renders as a broken-image icon in a Foundry journal, so it becomes
    the dash it was drawing.
    """
    markup = unhead_cells(markup)
    markup = CREDIT.sub("", markup)
    markup = RULE_TABLE.sub("", markup)
    markup = SPACER_TABLE.sub("", markup)
    markup = re.sub(r'<img[^>]*src="dash\.gif"[^>]*>', "&mdash;", markup, flags=re.I)
    markup = re.sub(r"\n{3,}", "\n\n", markup)
    return markup.strip()


def entries_of(site: Site) -> list[list[str]]:
    """The site's pages, grouped into one journal entry each.

    An entry is a section and everything under it: Combat, and the eight pages
    the menu indents beneath it. The expansions need no special case, because
    the menu re-roots inside them - open any d20 Future page and its sixteen
    chapters are drawn at section level under the d20 Future banner, exactly
    as the core SRD's are under its own.
    """
    return [site.descendants(section) for section in site.children.get(None, [])]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--refresh", action="store_true",
                        help="re-fetch every page before reading it")
    args = parser.parse_args()

    site = read_site(args.refresh)
    print(f"  {len(site.order)} pages, {len(site.children.get(None, []))} sections")

    documents = []
    for pages in entries_of(site):
        first = pages[0]
        contents = []
        for page in pages:
            markup = tidy(body(srd.fetch(page, refresh=False)))
            if not text_of(markup):
                print(f"  ! {page} has no content", file=sys.stderr)
                continue
            # The page it came from, so the build can turn the SRD's own
            # cross-references into links between compendium pages.
            contents.append({"name": site.label[page], "source": page, "html": markup})
        if not contents:
            continue
        documents.append({
            "id": os.path.splitext(first)[0],
            "book": site.book[first],
            "title": site.label[first],
            "source": first,
            "pages": contents,
        })

    documents.sort(key=lambda entry: (list(BOOKS.values()).index(entry["book"])
                                      if entry["book"] in BOOKS.values() else 9,
                                      site.order.index(entry["source"])))

    out = os.path.join(srd.DATA, "rules.json")
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(documents, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    pages = sum(len(entry["pages"]) for entry in documents)
    for book in dict.fromkeys(entry["book"] for entry in documents):
        count = [entry["book"] for entry in documents].count(book)
        print(f"  {book:14} {count:3} entries")
    print(f"\ndata/rules.json: {len(documents)} entries, {pages} pages")
    return 0


if __name__ == "__main__":
    sys.exit(main())

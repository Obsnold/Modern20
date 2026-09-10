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
import collections
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


# Pages the SRD prints as one long run of entries, and the heading level each
# entry is named at. The Menace Manual sells its creatures four to a page,
# twenty at a time, which is a page nobody scrolls: split at the level the
# creature names sit on and each gets its own.
SPLIT_AT = {
    # Creatures, four books of them.
    "creatures1.html": ("creaturesaz.html", 4),
    "creatures2.html": ("creaturesaz.html", 4),
    "creatures3.html": ("creaturesaz.html", 4),
    "creatures4.html": ("creaturesaz.html", 4),
    "animals.html": (None, 4),
    "urbanmonst1.html": ("urbanmonstaz.html", 4),
    "urbanmonst2.html": ("urbanmonstaz.html", 4),
    "urbanmonst3.html": ("urbanmonstaz.html", 4),
    "urbanmonst4.html": ("urbanmonstaz.html", 4),
    "menacecreat1.html": ("menacecreatures.html", 4),
    "menacecreat2.html": ("menacecreatures.html", 4),
    "menacecreat3.html": ("menacecreatures.html", 4),
    "menacecreat4.html": ("menacecreatures.html", 4),

    # Spells, powers and the rest of what a caster looks up by name.
    "fxspelldesc1.html": ("fxspellsaz.html", 5),
    "fxspelldesc2.html": ("fxspellsaz.html", 5),
    "fxpowers.html": ("fxpowersaz.html", 5),
    "urbanspelldesc.html": ("urbanspellsaz.html", 5),
    "urbanpsidesc.html": (None, 5),
    "urbanincdesc.html": ("urbanincorder.html", 5),
    "urbanseed.html": (None, 5),

    # Feats and skills.
    "featorder.html": (None, 5),
    "urbanfeatorder.html": (None, 5),
    "futurefeats.html": (None, 5),
    "skillsorder.html": (None, 5),

    # Equipment. The books shape it differently: d20 Modern and Urban Arcana
    # name the categories and print the goods in tables under them, while d20
    # Future names every item it sells.
    "equipment.html": (None, 5),
    "general.html": (None, 5),
    "weapons.html": (None, 5),
    "armor.html": (None, 5),
    "vehicles.html": (None, 5),
    "urbanweapons.html": (None, 5),
    "urbangeneral.html": (None, 5),
    "urbanvehicles.html": (None, (5, 6)),
    "urbanemergency.html": (None, 5),
    "futuregadget.html": (None, (5, 6)),
    "futurepl5.html": (None, (5, 6)),
    "futurepl6.html": (None, (5, 6)),
    "futurepl7.html": (None, (5, 6)),
    "futurepl8.html": (None, (5, 6)),
    "futurevehicles.html": (None, (5, 6)),
    "futurevehiclegear.html": (None, (5, 6)),

    # Occupations, species and organizations: what a character is made of.
    # An organization's notable members and gear are headed a level below it
    # and stay on its page, which is the entry a reader is looking for.
    "occupations.html": (None, 5),
    "urbanoccs.html": (None, 5),
    "futureocc.html": (None, 5),
    "urbanspecies.html": (None, 4),
    "urbanpowerkind.html": (None, 4),
    "urbanorg.html": (None, 5),

    # Urban Arcana's magic items, by the kind of thing they are.
    "urbanfxarmor.html": (None, (5, 6)),
    "urbanfxweapon.html": (None, (5, 6)),
    "urbanfxstaff.html": (None, 6),
    "urbanfxpotion.html": (None, 6),
    "urbanfxring.html": (None, 6),
    "urbanfxtattoo.html": (None, 6),
    "urbanfxvehicle.html": (None, 6),

    # d20 Future builds things out of parts, and prices every part: the
    # progress levels, then a catalogue each for starships, mecha and robots.
    # The ship classes name their ships a level higher than the rest, because
    # under each is a repeated "Standard PL 6 Design Specs:".
    "futurepl.html": (None, 5),
    "futureshipclass.html": (None, 6),
    "futuredefense.html": (None, (5, 6)),
    "futurecomm.html": (None, (5, 6)),
    "futureultra.html": (None, 4),
    "futurelight.html": (None, 4),
    "futuremedium.html": (None, 4),
    "futureheavy.html": (None, 4),
    "futuresuper.html": (None, 4),
    "futuremech1.html": (None, (5, 6)),
    "futuremech3.html": (None, 5),
    "futuremech5.html": (None, 5),
    "futurerobot1.html": (None, 6),
    "futureroboteq1.html": (None, 6),
    "futureroboteq2.html": (None, 6),
    "futureroboteq3.html": (None, 6),
    "futureroboteq4.html": (None, 6),
    "futureroboteq5.html": (None, 6),
    "futurerobotex1.html": (None, 6),
    "futurerobotex2.html": (None, 6),
    "futurerobotex3.html": (None, 6),
    "futurerobot4.html": (None, 6),

    # Catalogues of named equipment: one thing per entry, looked up by name.
    "urbanfxitem.html": (None, 6),
    "urbanfxartifact.html": (None, (5, 6)),
    "futuremutant.html": (None, (5, 6)),
    "futurecyber2.html": (None, 6),
    "futuremecheq1.html": (None, (5, 6)),
    "futuremecheq2.html": (None, 6),
}

# Words the SRD sets in capitals because they are capitals, not because the
# heading is.
ACRONYMS = {"FX", "DC", "DCS", "HP", "AP", "PL", "GM", "GMS", "NPC", "NPCS",
            "SRD", "XP", "AC", "II", "III", "IV", "I"}

# Small words a title leaves alone unless they open it.
MINOR_WORDS = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "of",
               "on", "or", "the", "to", "with"}

ANCHOR_NAME = re.compile(r'<a\s+name="([^"]+)"', re.I)


def readable(name: str) -> str:
    """The SRD sets these headings in capitals; a contents list reads better not.

    "ACID RAINER" is Acid Rainer. Word by word rather than all or nothing,
    because the Menace Manual shouts only the creature's own name and writes
    the gloss after it normally: "FLESHRAKER (Knife Fiend)". A word that is
    not in capitals is already as its author wanted it.
    """
    out = []
    for index, word in enumerate(name.split()):
        bare = word.strip("(),.:;").upper()
        if not word.isupper() or len(bare) < 2 or bare in ACRONYMS:
            out.append(word)
        elif index and word.lower().strip(",") in MINOR_WORDS:
            out.append(word.lower())
        else:
            out.append(word.title())
    return " ".join(out)


def index_names(markup: str, page: str) -> dict[str, tuple[str, bool]]:
    """What the book's own A-Z index calls each anchor in one of its pages.

    The Menace Manual sets a creature's name in capitals and a variant of one
    in mixed case - ANIMATED OBJECT, then "Tiny to Medium", "Large to Huge" -
    which is the only thing in that book that tells the two apart. So the case
    is kept alongside the name, and it is what decides whether an unnamed
    heading starts an entry or continues one.
    """
    names = {}
    for match in re.finditer(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', markup, re.S | re.I):
        target, label = match.group(1), text_of(match.group(2))
        file, _, anchor = target.partition("#")
        if anchor and label and file.split("/")[-1] == page:
            names.setdefault(anchor, (label, label.isupper()))
    return names


# A stat block opens with a row naming the creature, sometimes after an empty
# cell holding a spacer image.
TABLE_TITLE = re.compile(r"<table\b[^>]*>.*?<t[dh]\b[^>]*>(.*?)</t[dh]>", re.S | re.I)


def stat_block_name(markup: str) -> str:
    """The name a stat block prints for itself, where the heading printed none.

    Urban Arcana heads several of its creatures with <h4><a name=""></a></h4>
    and puts the name in the table that follows: the elf, the gear golem and
    the urban wendigo are all headed by nothing at all. Only a table that
    starts straight after the heading counts, and only a cell short enough to
    be a name.
    """
    table = re.match(r"\s*(?:<br\s*/?>|\s)*<table\b", markup, re.I)
    if not table:
        return ""
    for match in re.finditer(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", markup[:1200], re.S | re.I):
        text = text_of(match.group(1))
        if text and len(text) < 60:
            return text
    return ""


def unnamed_entry(heading: str, rest: str, names: dict[str, tuple[str, bool]]) -> str:
    """What a heading holding nothing but an anchor is, if it is anything.

    An entry, and this is its name - or a divider inside the entry above it,
    and the answer is nothing. The index settles it where it names the anchor:
    a name set in capitals is an entry, a name set in mixed case is a variant
    of the one before. Where it does not, the stat block underneath does.
    """
    anchor = ANCHOR_NAME.search(heading)
    if anchor and anchor.group(1) in names:
        label, capitalised = names[anchor.group(1)]
        return label if capitalised else ""
    return stat_block_name(rest)


def prose(markup: str) -> str:
    """A fragment with its headings and links taken out.

    What is left is what the fragment says for itself. The SRD opens most of
    its pages with a banner and a list of links to the sections below, which
    is a table of contents rather than text, and a compendium builds its own.
    """
    markup = re.sub(r"<h[1-6][^>]*>.*?</h[1-6]>", " ", markup, flags=re.S | re.I)
    return re.sub(r"<a\b[^>]*>.*?</a>", " ", markup, flags=re.S | re.I)


def split_entries(markup: str, level: int | tuple[int, ...], name: str,
                  names: dict[str, tuple[str, bool]]) -> list[dict] | None:
    """One page per entry, where the SRD prints a run of them in one page.

    Split at the headings that name an entry - and at the ones that do not.
    A third of the Menace Manual's creatures are headed by nothing but an
    anchor, their name printed in the stat block table instead: the grimlock
    is <h4><a name="creat6"></a></h4>, and splitting on the visible headings
    alone filed it inside the ghoul. The book's own index names those.

    An anchored heading the index does not name in capitals is a variant
    within an entry rather than an entry - the large animated object belongs
    on the animated object's page, and a link to it still lands there.
    """
    # More than one level where the book names a category and then the items
    # under it: split at the item level alone and every category heading is
    # swallowed by the item printed above it.
    levels = "".join(str(one) for one in
                     (level if isinstance(level, tuple) else (level,)))
    heading = re.compile(rf"<h([{levels}])\b[^>]*>(.*?)</h\1>", re.S | re.I)
    marks = []
    for match in heading.finditer(markup):
        title = text_of(match.group(2))
        if not title:
            title = unnamed_entry(match.group(2), markup[match.end():], names)
        if title:
            marks.append((match.start(), readable(title), int(match.group(1))))
    if len(marks) < 2:
        return None

    pages = []
    # Anything before the first entry is the page's own banner and its
    # quick-find links, which the entry's own contents list already is. Kept
    # only where it says something else - Urban Arcana opens its wondrous
    # items by saying what one is - and named apart where the book heads its
    # first section with the page's own name: d20 Future's gadget page opens
    # on "The Gadget System".
    preamble = markup[:marks[0][0]]
    if len(text_of(prose(preamble))) > 80:
        first = name if name not in [title for _, title, _ in marks] else f"{name} (Overview)"
        pages.append({"name": first, "part": "", "html": preamble.strip()})

    for index, (start, title, level) in enumerate(marks):
        end = marks[index + 1][0] if index + 1 < len(marks) else len(markup)
        # The section this one is printed under, for telling two entries of
        # the same name apart: d20 Future sells a Compact weapon gadget and a
        # Compact equipment gadget on one page.
        part = next((was for _, was, deeper in reversed(marks[:index]) if deeper < level), "")
        pages.append({"name": title, "part": part, "html": markup[start:end].strip()})
    return pages


def entries_of(site: Site) -> list[list[str]]:
    """The site's pages, grouped into one journal entry each.

    An entry is a section and everything under it: Combat, and the eight pages
    the menu indents beneath it. The expansions need no special case, because
    the menu re-roots inside them - open any d20 Future page and its sixteen
    chapters are drawn at section level under the d20 Future banner, exactly
    as the core SRD's are under its own.
    """
    return [site.descendants(section) for section in site.children.get(None, [])]


def disambiguate(pages: list[dict], label: dict[str, str]) -> None:
    """Two pages of one entry with the same name, told apart by where they are.

    The SRD prints darkvision, daze, levitate and telekinesis as both a spell
    and a psionic power, and both live in FX Basics. Split into a page each,
    they are two identical rows in the contents list. Each is named for the
    part of the book it comes from - the part's own name, up to the range it
    carries: "Spells (Aid to Insect Plague)" is Spells.
    """
    seen = collections.Counter(page["name"] for page in pages)
    for page in pages:
        if seen[page["name"]] > 1:
            # The section it is printed under first, since two entries of one
            # name are usually on one page - a Compact weapon gadget and a
            # Compact equipment gadget - and the page they share cannot tell
            # them apart. Failing that, the part of the book it comes from.
            part = page.get("part") or label.get(page["source"], "").split("(")[0].strip()
            if part:
                page["name"] = f"{page['name']} ({part})"
        page.pop("part", None)


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
            # The page it came from, and the anchors that page's own links
            # aim at, so the build can turn the SRD's cross-references into
            # links between compendium pages - including the ones that point
            # into the middle of a page that has since been split up.
            split = None
            if page in SPLIT_AT:
                index, level = SPLIT_AT[page]
                names = index_names(tidy(body(srd.fetch(index))), page) if index else {}
                split = split_entries(markup, level, site.label[page], names)
            for part in split or [{"name": site.label[page], "html": markup}]:
                contents.append({
                    "name": part["name"],
                    "part": part.get("part", ""),
                    "source": page,
                    "anchors": ANCHOR_NAME.findall(part["html"]),
                    "html": part["html"],
                })
        if not contents:
            continue
        disambiguate(contents, site.label)
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

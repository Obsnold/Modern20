#!/usr/bin/env python3
"""Which page of the rules reference each compendium document belongs to.

The rules journal is now one page per entry: a page for the Acrobatic feat,
one for the gargoyle, one for Handguns, one for the Autodyn Hoverbike. That is
what makes a link from a document to its rules worth having — before the split
a link landed on a page of ninety-five feats and the reader scrolled.

This is the half that finds the page. It builds an index of every page the
importer will build, with the UUID that page will have, and matches a document
to it. Two callers use the same index so they cannot disagree:
tools/build_packs.py stamps `system.rulesPage` on what it imports, and
tools/link_rules.py stamps the documents already in src/packs, which is the
source of truth and is never rewritten wholesale.

The UUIDs are safe to store because the ids are derived, not random:
`srd.document_id` hashes the pack and the slug, so the page that carries the
gargoyle's rules has the same id in every build.
"""
from __future__ import annotations

import collections
import functools
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

Page = collections.namedtuple("Page", "uuid name source entry book")

# How a document was matched to its page, most precise first. Reported rather
# than discarded: "page" means the document landed on the chapter it was
# printed in because nothing finer matched, and a count of those is the measure
# of how much of this is actually working.
ORDER = ["name", "variant", "category", "class", "page"]

# The annotation the SRD heads every skill page with - "Balance (Dex; Armor
# Penalty)", "Demolitions (Int) Trained Only" - which is the skill's key
# ability and its restrictions rather than part of its name.
ABILITIES = r"(?:Str|Dex|Con|Int|Wis|Cha|None)"
ANNOTATION = re.compile(
    rf"\s*\(\s*{ABILITIES}\b[^)]*\)"
    r"(?:\s*(?:Trained Only|Armor Penalty|Trained Only; Armor Penalty))?\s*$",
    re.I,
)

# Qualifiers the importer added to tell two pages of the same name apart, and
# which the document's own name therefore does not carry. Darkvision is both a
# spell and a psionic power, and both are in FX Basics.
QUALIFIER = re.compile(
    r"\s*\((?:Spells|Psionic Powers|Arcane|Divine|Psionic|Template|Prestige Class)\)\s*$",
    re.I,
)

# Which of those qualified pages a pack wants, where both exist.
PREFERRED = {"spells": "spells", "psionics": "psionic powers"}

# A trailing parenthetical or bracket is a qualifier rather than a name: the
# progress level a d20 Future vehicle is sold at ("Autodyn Hoverbike (PL 7)"),
# the section the importer named a page for to tell it from another of the same
# name, the size a creature variant is printed at, the category Urban Arcana
# files a feat under ("Empower Spell [Metamagic]"). Stripped for the loose
# comparison only - the exact one has to keep it, or every Craft specialty
# collapses onto the Craft page.
TRAILING = re.compile(r"\s*[([][^)\]]*[)\]]\s*$")

# The SRD's own typo in a table heading. The page it prints the goods under
# spells it correctly, so nothing matches without this.
CATEGORY_TYPOS = {"hanguns": "handguns"}

# A page that is the table itself rather than the rules around it. An item was
# parsed out of one of these, but a reader following a link wants the prose the
# table is printed inside, so they are never a fallback.
TABLE_PAGE = re.compile(r"\btable$", re.I)

# Which packs store the SRD's own category heading in `system.category`. The
# others store a taxonomy of the system's own - a weapon's category is the
# proficiency it needs and an armor's is its weight class - and matching a page
# against that put every grenade under Simple Melee Weapons.
CATEGORY_IS_SRD = {"gear", "fx"}

# What d20 Future calls an equipment page. It names its tables by progress
# level rather than by category - the PL 5 page sells "Information Age
# Weapons", "Information Age Armor" and "Information Age Equipment" - so the
# pack an item landed in is what picks the page out.
KIND_WORD = {"weapons": "weapons", "armor": "armor", "gear": "equipment"}

# A creature the SRD prints as a variant of another, or as a statted-up
# version of it, and which therefore has no page of its own: the advanced acid
# rainer is on the acid rainer's page, "Huge Crocodile" on the crocodile's.
# Sizes are the SRD's own categories; the classes are what a stat block's name
# appends when it builds a creature as a character.
SIZES = r"(?:Fine|Diminutive|Tiny|Small|Medium(?:-size)?|Large|Huge|Gargantuan|Colossal)"
CLASSED = re.compile(
    r"\s+(?:Strong|Fast|Tough|Smart|Dedicated|Charismatic)\s+"
    r"(?:Hero|Ordinary)\b.*$", re.I)


def normalise(name: str) -> str:
    """A page or document name as the two can be compared."""
    text = ANNOTATION.sub("", (name or "").strip())
    text = QUALIFIER.sub("", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def loose(name: str) -> str:
    """A name without the qualifier the SRD or the importer put after it."""
    return TRAILING.sub("", normalise(name)).strip()


def tokens(name: str) -> set[str]:
    """The words of a name, for comparing a table heading with a page title.

    A table heading carries the feat its goods need - "Longarms (requires the
    Personal Firearms Proficiency feat)" - and a page title carries the part
    of the chapter it sits in: "Simple Weapons" is printed under "Simple Melee
    Weapons". Neither is the other's substring, and both are the same thing.
    """
    return set(re.findall(r"[a-z0-9]+", loose(name)))


def variants(name: str):
    """Names to try for a document the SRD prints inside another's entry.

    Each of these is a shape the creature compendium actually holds, and each
    is tried only against the pages of the one SRD page the stat block was
    printed on - which is what makes the last of them, dropping everything but
    the final word, safe rather than reckless: "Huge Crocodile Zombie" can
    only reach the zombie template that shares its page.
    """
    seen = []
    candidate = TRAILING.sub("", name).strip()
    unclassed = CLASSED.sub("", candidate)
    forms = [
        candidate,
        re.sub(r"^Advanced\s+", "", candidate, flags=re.I),
        re.sub(rf"^{SIZES}\s+", "", candidate, flags=re.I),
        unclassed,
        re.sub(rf"^{SIZES}\s+", "", unclassed, flags=re.I),
    ]
    # A stat block built as a character ends in its levels - "Etoile Techie 5",
    # "Malleable Human Tough Hero 4/Dedicated Hero 2" - and the advanced class
    # in the middle is not a fixed list, so the words come off one at a time
    # until the creature's own name is left.
    if re.search(r"\d\s*$", candidate):
        words = candidate.split()
        forms += [" ".join(words[:count]) for count in range(len(words) - 1, 0, -1)]
    forms.append(candidate.split()[-1] if candidate.split() else "")

    for form in forms:
        form = form.strip()
        if form and form != name and form not in seen:
            seen.append(form)
    return seen


@functools.cache
def default() -> RulesIndex:
    """The index of data/rules.json, built once for the whole run."""
    return RulesIndex.load()


def stored_category(system: dict, pack: str) -> str:
    """The SRD heading a document carries, under whatever name its pack uses.

    Armor is filed by the weight class the SRD heads its tables with, so the
    field is the heading. A weapon's is the proficiency it needs, which is not,
    and a gear item's is the heading as scraped.
    """
    if pack == "armor" and system.get("armorType"):
        return f"{system['armorType']} armor"
    if pack in CATEGORY_IS_SRD:
        return system.get("category") or ""
    return ""


class RulesIndex:
    """Every page the rules compendium will hold, indexed for lookup."""

    def __init__(self, entries: list[dict]):
        self.pages: list[Page] = []
        self.by_source: dict[str, list[Page]] = collections.defaultdict(list)
        self.by_entry: dict[str, list[Page]] = collections.defaultdict(list)
        self.by_name: dict[str, list[Page]] = collections.defaultdict(list)
        # Where a reference to one of the SRD's own files, or to an anchor
        # inside it, should land.
        self.anchors: dict[str, str] = {}
        self.split: set[str] = set()
        # What `link` has stamped, for the build to report.
        self.counts: collections.Counter = collections.Counter()
        self.embedded: collections.Counter = collections.Counter()

        counts: collections.Counter = collections.Counter()
        for entry in entries:
            slug = srd.slugify(entry["id"])
            journal = srd.document_id("rules", slug)
            for position, page in enumerate(entry["pages"]):
                uuid = (f"Compendium.modern20.rules.JournalEntry.{journal}"
                        f".JournalEntryPage."
                        f"{srd.document_id('rules', f'{slug}-{position}')}")
                record = Page(uuid, page["name"], page.get("source") or "",
                              entry["id"], entry["book"])
                self.pages.append(record)
                self.by_entry[entry["id"]].append(record)
                self.by_name[normalise(record.name)].append(record)
                if not record.source:
                    continue
                self.by_source[record.source].append(record)
                counts[record.source] += 1
                # A reference to a page that was split lands on the first of
                # its pages; a reference to an anchor inside it lands on the
                # entry that anchor names.
                self.anchors.setdefault(record.source, uuid)
                for anchor in page.get("anchors") or []:
                    self.anchors.setdefault(f"{record.source}#{anchor}", uuid)
        self.split = {source for source, count in counts.items() if count > 1}

    @classmethod
    def load(cls, path: str | None = None) -> RulesIndex:
        path = path or os.path.join(srd.DATA, "rules.json")
        with open(path, encoding="utf-8") as handle:
            return cls(json.load(handle))

    def page(self, source: str, name: str) -> Page | None:
        """One named page of one SRD file, for a link written by hand."""
        wanted = normalise(name)
        for record in self.by_source.get(source, []):
            if normalise(record.name) == wanted:
                return record
        return None

    def _pick(self, candidates: list[Page], pack: str, book: str) -> Page:
        """One page out of several of the same name.

        Two things decide it: which list the pack is - a spell wants the spell
        called darkvision and a power wants the power - and which book the
        document came from, since three chapter titles appear in two books.
        """
        wanted = PREFERRED.get(pack)
        if wanted:
            qualified = [page for page in candidates
                         if wanted in page.name.lower()]
            if qualified:
                return qualified[0]
        if book:
            same = [page for page in candidates if page.book == book]
            if same:
                return same[0]
        return candidates[0]

    def _named(self, name: str, scope: list[Page]) -> Page | None:
        wanted = normalise(name)
        for record in scope:
            if normalise(record.name) == wanted:
                return record
        return None

    def _worded(self, name: str, scope: list[Page]) -> Page | None:
        """A page whose title says the same thing as a table heading.

        One word set inside the other, either way round, so a heading with the
        proficiency in it and a page title with the part of the chapter in it
        both reach the same page. The shortest title wins, which is the page
        that is about the category rather than one printed under it.
        """
        wanted = tokens(name)
        if not wanted:
            return None
        found = [page for page in scope
                 if not TABLE_PAGE.search(loose(page.name))
                 and (wanted <= tokens(page.name) or tokens(page.name) <= wanted)]
        return min(found, key=lambda page: len(tokens(page.name)), default=None)

    def _kind(self, word: str, scope: list[Page]) -> Page | None:
        """The weapons, armor or equipment page of one section of a chapter.

        Never the page the word is the whole of the title of, which is the
        chapter itself: that is the fallback this is trying to improve on.
        """
        found = [page for page in scope if word in tokens(page.name)
                 and not TABLE_PAGE.search(loose(page.name))
                 and loose(page.name) != word]
        return min(found, key=lambda page: len(tokens(page.name)), default=None)

    def match(self, document: dict, pack: str, *, category: str = "",
              local: bool = False) -> tuple[str, Page] | None:
        """The page a document belongs on, and how it was found.

        Widening scopes, narrowest first: the pages of the SRD page this was
        scraped from, then the pages of the chapter that page is part of, then
        every page in the SRD. A magic item cites `fxitems.html` and its page
        is under `urbanfxweapon.html`, which is the same chapter and a
        different file, so the middle scope is what finds it.

        An embedded document is matched `local`, which drops the widest scope.
        Its name is the creature's own phrasing rather than an SRD entry -
        "Claw (x2)", "Slam" - and reaching across the whole SRD for one of
        those put an ape's claws on a PL 5 robot accessory. What it does still
        reach is the page its own citation names, which is why a creature's
        feats land on their feat and its abilities on the glossary.
        """
        system = document.get("system") or {}
        source = os.path.basename((system.get("srdUrl") or "").split("#")[0])
        book = (document.get("flags", {}).get("modern20", {}).get("book")
                or system.get("source") or "")
        here = self.by_source.get(source, [])
        entry = self.by_entry[here[0].entry] if here else []
        scopes = (here, entry) if local else (here, entry, self.pages)

        name = document.get("name", "")
        for compare in (normalise, loose):
            wanted = compare(name)
            for scope in scopes:
                candidates = [page for page in scope if compare(page.name) == wanted]
                if candidates:
                    return "name", self._pick(candidates, pack, book)

        # A variant or a statted-up version, on the page of the creature it is
        # one of. Only ever inside its own SRD page.
        for form in variants(name):
            found = self._named(form, here)
            if found:
                return "variant", found

        # A name that says the entry's name and more: "Human Liquefied Zombie"
        # is the zombie template the SRD heads "Zombie, Liquefied", and the
        # words are the only thing the two have in common. Inside its own page,
        # where the entry it varies is what it can reach.
        # The same words in the SRD's own filing order counts: the compendium
        # holds the "Dire Rat" that the book heads "Rat, Dire".
        worded = self._worded(name, here)
        if worded and tokens(worded.name) <= tokens(name):
            return "variant", worded

        # The category the SRD sold it under. d20 Modern heads a page
        # "Handguns" and prints the goods in a table beneath it, so for those
        # books a page is a category and this is as fine as a link can get.
        for wanted in (category, stored_category(system, pack)):
            if not wanted:
                continue
            wanted = CATEGORY_TYPOS.get(loose(wanted), wanted)
            for scope in (here, entry):
                found = self._named(wanted, scope) or self._worded(wanted, scope)
                if found:
                    return "category", found

        # "Ranged Weapons" and "Melee Weapons", which is how Urban Arcana
        # divides its weapons where d20 Modern divides them by proficiency.
        if pack == "weapons":
            found = self._kind("ranged" if system.get("ranged") else "melee", here)
            if found:
                return "category", found

        word = KIND_WORD.get(pack)
        if word:
            found = self._kind(word, here)
            if found:
                return "category", found

        # A talent is described in the prose of the class whose tree it is in,
        # never in a list of its own.
        owner = system.get("sourceClass") or ""
        if owner:
            for scope in scopes:
                found = self._named(owner, scope)
                if found:
                    return "class", found

        # Nothing finer matched, so the chapter it was printed in. Not the
        # first page of its own SRD page: a page that was split into one page
        # per entry has no first page worth landing on, and a reference that
        # found nothing was landing on whichever creature came first - the
        # dragon emperor arriving at the ash wraith.
        if source in self.split and entry:
            return "page", entry[0]
        if here:
            return "page", here[0]
        return None

    def link(self, document: dict, pack: str, *, category: str = "",
             embedded: bool = False) -> str:
        """Stamp `system.rulesPage` on a document, and say how it was found.

        Embedded documents are stamped too: a creature's own abilities are
        printed on the creature's page, and its feats have pages of their own.
        They are counted apart from their parents, because three thousand
        creature abilities would otherwise be the whole of the figure.
        """
        how = "none"
        found = self.match(document, pack, category=category, local=embedded)
        if found and document.get("system") is not None:
            how, page = found
            document["system"]["rulesPage"] = page.uuid
        (self.embedded if embedded else self.counts)[how] += 1
        for child in (document.get("items") or []):
            self.link(child, pack, embedded=True)
        return how

    def report(self) -> str:
        """How the links made so far were found, most precise first."""
        def summary(counts):
            return ", ".join(f"{counts[how]} by {how}"
                             for how in ORDER + ["none"] if counts[how])
        out = f"  rules pages: {summary(self.counts)}"
        if self.embedded:
            out += f"\n  embedded documents: {summary(self.embedded)}"
        return out

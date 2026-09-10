#!/usr/bin/env python3
"""Fill the holes the SRD's website has, from the documents Wizards released.

    pandoc must be installed, and the documents downloaded:
    python3 scripts/import_missing.py ~/Downloads/d20modernsrd

The mirror is the source for the rules reference, and it is missing four of
d20 Modern's chapters outright. Not broken links or truncated pages - the text
is not on the site at all: nothing on it says what an action point does, what
happens at negative hit points, how Reputation is checked, or how a skill
check works. Every one of them is in the RTF releases.

That was found by taking every sentence of each RTF and looking for it in the
imported text. Four documents scored zero. Everything else scored well enough
to be a wording difference rather than an absence, and the mirror's own broken
links turned out to be old URLs for pages it still has - spellsaz.html is
fxspellsaz.html - rather than lost content.

The output is committed, so building the packs needs neither pandoc nor the
documents. scripts/import_rules.py folds it into data/rules.json on every run.
"""
import argparse
import json
import re
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# What the site does not have, what to call it, and where it belongs: "after"
# puts it in its own entry following that one, "into" appends its pages to an
# entry that is already there.
MISSING = [
    {"file": "Modern/msrdactionpoints.rtf", "title": "Action Points",
     "book": "d20 Modern", "after": "basics"},
    {"file": "Modern/msrdreputation.rtf", "title": "Reputation",
     "book": "d20 Modern", "after": "allegiances"},
    {"file": "Modern/msrdskillsoverview.rtf", "title": "Skill Basics",
     "book": "d20 Modern", "into": "skills"},
    {"file": "Modern/msrddeathdyinghealing.rtf", "title": "Death, Dying, and Healing",
     "book": "d20 Modern", "after": "combat"},
]


def convert(path: str) -> str:
    """One RTF as HTML, by way of pandoc."""
    result = subprocess.run(["pandoc", "-f", "rtf", "-t", "html", path],
                            capture_output=True, text=True, check=True)
    return result.stdout


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", help="the directory holding Modern/, Arcana/, Future/, Menaces/")
    args = parser.parse_args()

    if not shutil.which("pandoc"):
        print("pandoc is needed to read the RTF; data/rules-extra.json is "
              "committed, so this is only for regenerating it", file=sys.stderr)
        return 1

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import import_rules  # noqa: PLC0415 - importing a sibling script, not a package

    out = []
    for entry in MISSING:
        path = os.path.join(args.source, entry["file"])
        if not os.path.exists(path):
            print(f"  ! {entry['file']} is not in {args.source}", file=sys.stderr)
            continue

        markup = import_rules.tidy(strip_body(convert(path)))
        pages = split(markup, entry["title"], import_rules)
        out.append({
            "id": os.path.splitext(os.path.basename(entry["file"]))[0],
            "book": entry["book"],
            "title": entry["title"],
            "source": os.path.basename(entry["file"]),
            "after": entry.get("after"),
            "into": entry.get("into"),
            "pages": pages,
        })
        print(f"  {entry['title']:28} {len(pages):3} pages from {entry['file']}")

    target = os.path.join(srd.DATA, "rules-extra.json")
    with open(target, "w", encoding="utf-8") as handle:
        json.dump(out, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(f"\ndata/rules-extra.json: {len(out)} documents, "
          f"{sum(len(d['pages']) for d in out)} pages")
    return 0


def strip_body(markup: str) -> str:
    """Pandoc's output, with what pandoc added to it taken back out.

    It stripes table rows odd and even, which is its own styling rather than
    the SRD's, and the rules pack is checked for exactly that: it is the
    fingerprint of a page that came through a converter.
    """
    return re.sub(r'\s+class="(?:odd|even|heading)"', "", markup).strip()


def split(markup: str, title: str, import_rules) -> list[dict]:
    """One page per section, at whichever heading level the document uses.

    These are Word files, and the level a section sits at is whatever it was
    the day it was typed: the skills overview names its sections at one level
    and death and dying at another. The shallowest level that yields more than
    one section and names them distinctly is the one to break at - the same
    judgement the mirror's own page structure spares us everywhere else.
    """
    import re
    levels = {}
    for match in re.finditer(r"<h([1-6])[^>]*>(.*?)</h\1>", markup, re.S | re.I):
        text = import_rules.text_of(match.group(2))
        if text:
            levels.setdefault(int(match.group(1)), []).append((match.start(), text))

    chosen = None
    for level in sorted(levels):
        marks = levels[level]
        if len(marks) > 1 and len({name for _, name in marks}) == len(marks):
            chosen = level
            break
    if chosen is None:
        return [{"name": title, "source": "", "anchors": [], "html": markup}]

    marks = levels[chosen]
    pages = []
    preamble = markup[:marks[0][0]]
    if len(import_rules.text_of(import_rules.prose(preamble))) > 80:
        pages.append({"name": title, "html": preamble.strip()})
    for index, (start, name) in enumerate(marks):
        end = marks[index + 1][0] if index + 1 < len(marks) else len(markup)
        pages.append({"name": import_rules.readable(name), "html": markup[start:end].strip()})
    return pages


if __name__ == "__main__":
    sys.exit(main())

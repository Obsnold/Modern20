#!/usr/bin/env python3
"""Vendor the icons `scripts/art.py` names, from game-icons.net.

    python3 scripts/fetch_art.py            # fetch what is missing
    python3 scripts/fetch_art.py --force    # fetch everything again
    python3 scripts/fetch_art.py --list     # say what would be fetched

The icons are CC BY 3.0 (a few CC0), which is a licence with a condition: the
author has to be credited. So the author is not something this guesses. It
reads the upstream tree at a pinned commit, which files the icons by author —
`skoll/kevlar-vest.svg`, `john-colburn/pistol-gun.svg` — and keeps that
filing, so where an icon came from is legible in its own path and
`assets/icons/CREDITS.md` is generated from the same reading rather than
written by hand.

Ten subjects were drawn by two authors each. Those are named in the map as
`author/slug`, because picking one silently would credit the wrong person.

Each file is rewritten on the way in, for one reason that is not decoration:
game-icons publishes a white glyph with no background, which on Foundry's own
light item rows is a white square on a white row. Each icon is given the
system's own paper ground and ink glyph, so it reads on any sheet and in any
theme, and so a compendium of them looks like one set rather than 147 files
from the internet.

Pinned to a commit, so this is reproducible: re-running fetches the same bytes
a year from now, and moving to a newer upstream is an edit to COMMIT here
rather than something that happens quietly on somebody else's machine.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art  # noqa: E402
import srd  # noqa: E402

# game-icons.net's own archive of every icon on the site.
REPO = "game-icons/icons"
COMMIT = "82d948812bfe3f269ef8f731dcdb07b08160edc4"  # master, 23 April 2026
SITE = "https://game-icons.net"
LICENCE = "CC BY 3.0"

TREE = f"https://api.github.com/repos/{REPO}/git/trees/{COMMIT}?recursive=1"
RAW = f"https://raw.githubusercontent.com/{REPO}/{COMMIT}/"

ASSETS = art.ASSETS
TOKENS = art.TOKENS

# How much of the token the drawing takes up.
#
# A token is read at one grid square across, and 0.72 left a creature filling
# less of its square than Foundry's own mystery-man does — which looks like the
# token is the wrong size rather than like the art has a margin. The disc is
# the ground the figure stands on, not a frame around it, so ink that reaches
# past the rim is fine and a glyph that is nearly the whole square is the point.
TOKEN_GLYPH = 0.86

# The system's own palette, from css/modern20.css: ink on paper.
INK = "#1c1a17"
PAPER = "#f6f2ea"
RULE = "#cfc7bb"

# An icon as it is published: one viewBox, a background rect the site uses for
# its own previews, and the glyph. The rect is dropped and replaced, since its
# colour is the site's and not this system's.
VIEWBOX = re.compile(r'viewBox="([^"]+)"')
BACKGROUND = re.compile(r"<path[^>]*\bd=\"M0 0h512v512H0z\"[^>]*/>", re.I)
FILL = re.compile(r'\sfill="[^"]*"')


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={
        # GitHub refuses an anonymous request with no agent.
        "User-Agent": f"modern20-fetch-art (+{SITE})",
        "Accept": "application/vnd.github+json",
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def upstream() -> dict[str, list[str]]:
    """Every icon in the pinned tree: slug -> the authors who drew one."""
    listing = json.loads(fetch(TREE))
    if listing.get("truncated"):
        raise SystemExit("the upstream tree came back truncated")
    by_slug: dict[str, list[str]] = {}
    for entry in listing.get("tree") or []:
        path = entry.get("path") or ""
        if entry.get("type") != "blob" or not path.endswith(".svg"):
            continue
        author, _, name = path.rpartition("/")
        # The repository's own site furniture is not an icon by an author:
        # `badges/club.svg` is a card suit on a shield, not a cudgel.
        if not author or author == "badges":
            continue
        by_slug.setdefault(name[:-4], []).append(author)
    return by_slug


def resolve(icon: str, by_slug: dict[str, list[str]]) -> str:
    """The upstream path for an icon the map names.

    A bare slug drawn by one author resolves to that author. A slug two
    authors drew has to say which, because crediting the wrong one is the one
    way to get a CC BY licence wrong while looking tidy.
    """
    if "/" in icon:
        author, slug = icon.split("/", 1)
        if author not in (by_slug.get(slug) or []):
            raise SystemExit(f"{icon}: {author} has no {slug}.svg upstream")
        return f"{author}/{slug}.svg"

    authors = by_slug.get(icon)
    if not authors:
        raise SystemExit(f"{icon}: no icon of that name upstream")
    if len(authors) > 1:
        raise SystemExit(
            f"{icon}: drawn by {', '.join(sorted(authors))} — name one in art.py")
    return f"{authors[0]}/{icon}.svg"


# The tile this script writes into assets/icons, which a re-cut has to remove
# before it can draw a disc in its place.
OWN_RECT = re.compile(r"<rect\b[^>]*/>", re.I)


def disc(head: str, glyph: str, width: float, height: float) -> str:
    """The glyph on a paper disc, filling the square it will be drawn in."""
    # Whatever colour the element already carried comes off first: a re-cut
    # reads a file this script wrote, which already states one, and two `fill`
    # attributes on one element is not valid XML.
    head = FILL.sub("", head)
    stroke = max(2, round(width / 64))
    # Full bleed: the stroke is centred on the path, so half of it would fall
    # outside the viewBox and be clipped at every edge.
    radius = width / 2 - stroke / 2
    inset = round((1 - TOKEN_GLYPH) / 2, 4)
    return (
        f"{head} fill=\"{INK}\">"
        f"<circle cx=\"{width / 2:g}\" cy=\"{height / 2:g}\" r=\"{radius:g}\""
        f" fill=\"{PAPER}\" stroke=\"{RULE}\" stroke-width=\"{stroke}\"/>"
        f"<g transform=\"translate({width * inset:g} {height * inset:g})"
        f" scale({TOKEN_GLYPH})\">{glyph}</g></svg>\n"
    )


def recut(icon: str, path: str) -> str:
    """A disc from an icon this script already wrote, without fetching again.

    The glyph survives in `assets/icons` exactly as it arrived — one path, its
    own colours stripped — so changing how a token looks does not mean asking
    game-icons.net for 163 files it has already given us once.
    """
    box = VIEWBOX.search(icon)
    if not box:
        raise SystemExit(f"{path}: no viewBox")
    size = box.group(1).split()
    head, _, rest = icon.partition(">")
    glyph = OWN_RECT.sub("", rest.replace("</svg>", "")).strip()
    if "<path" not in glyph:
        raise SystemExit(f"{path}: no glyph left after removing the tile")
    return disc(head, glyph, float(size[2]), float(size[3]))


def as_token(svg: str, path: str) -> str:
    """The same drawing as token artwork: the glyph on a disc.

    An actor that states no token artwork gets Foundry's own
    CONST.DEFAULT_TOKEN, which is the grey mystery-man — so every creature in
    the compendium arrived on a map as the same silhouette, however well its
    sheet was illustrated. A square tile is right in a list and wrong on a
    battlemap, where a token reads as a figure on a square of ground, so this
    cuts the tile into a circle and insets the glyph to sit inside it.
    """
    box = VIEWBOX.search(svg)
    if not box:
        raise SystemExit(f"{path}: no viewBox")
    size = box.group(1).split()

    head, _, rest = BACKGROUND.sub("", svg).partition(">")
    if not rest:
        raise SystemExit(f"{path}: not an svg element")
    glyph = FILL.sub("", rest.replace("</svg>", "").strip())
    return disc(head, glyph, float(size[2]), float(size[3]))


def restyle(svg: str, path: str) -> str:
    """The published icon as this system's: ink on paper, in a rounded tile.

    The glyph's own fill is dropped rather than overridden, since a `fill` on
    the path wins over one on the `<svg>`, and a few icons carry one.
    """
    box = VIEWBOX.search(svg)
    if not box:
        raise SystemExit(f"{path}: no viewBox")
    size = box.group(1).split()
    width = float(size[2])
    radius = round(width * 0.12, 1)

    body = BACKGROUND.sub("", svg)
    head, _, rest = body.partition(">")
    if not rest:
        raise SystemExit(f"{path}: not an svg element")
    # The glyph, with its own colours removed so the tile's fill applies.
    glyph = FILL.sub("", rest.replace("</svg>", "").strip())

    return (
        f"{head} fill=\"{INK}\">"
        f"<rect x=\"0\" y=\"0\" width=\"{size[2]}\" height=\"{size[3]}\""
        f" rx=\"{radius}\" ry=\"{radius}\" fill=\"{PAPER}\""
        f" stroke=\"{RULE}\" stroke-width=\"{max(1, round(width / 128))}\"/>"
        f"{glyph}</svg>\n"
    )


def credits(used: dict[str, str]) -> str:
    """The attribution the licence asks for, from what was actually fetched."""
    by_author: dict[str, list[str]] = {}
    for icon, path in sorted(used.items()):
        by_author.setdefault(path.split("/")[0], []).append(path.split("/")[1][:-4])

    lines = [
        "# Icon credits",
        "",
        f"The {len(used)} icons in this directory are from [game-icons.net]({SITE}),",
        f"licensed **{LICENCE}** (a few are CC0 — see the upstream",
        f"[licence]({SITE.replace('game-icons.net', 'game-icons.net/about.html')})).",
        "",
        "They are recoloured to this system's palette and given a background",
        "tile; the artwork is otherwise unchanged. The ones an actor can be",
        "pictured by are cut a second time, as discs, in `../tokens`. Fetched from",
        f"[{REPO}](https://github.com/{REPO}) at commit `{COMMIT[:12]}`",
        "by `scripts/fetch_art.py`, which also generates this file.",
        "",
        "## By author",
        "",
    ]
    for author in sorted(by_author):
        drawn = ", ".join(f"`{name}`" for name in sorted(by_author[author]))
        lines.append(f"**{author}** — {drawn}")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true",
                        help="fetch every icon again, not only the missing ones")
    parser.add_argument("--list", action="store_true",
                        help="say what would be fetched and stop")
    parser.add_argument("--recut", action="store_true",
                        help="redraw the token discs from the icons already here")
    arguments = parser.parse_args()

    wanted = sorted(art.icons())
    if arguments.list:
        print(f"{len(wanted)} icon(s) named by scripts/art.py:")
        for icon in wanted:
            print(f"  {icon}")
        return 0

    if arguments.recut:
        cut = 0
        for icon in sorted(art.token_icons()):
            found = art.resolve(icon)
            if not found:
                raise SystemExit(f"{icon}: not in assets/icons — fetch first")
            with open(os.path.join(ASSETS, found), encoding="utf-8") as handle:
                source = handle.read()
            token = os.path.join(TOKENS, found)
            os.makedirs(os.path.dirname(token), exist_ok=True)
            with open(token, "w", encoding="utf-8") as handle:
                handle.write(recut(source, found))
            cut += 1
        print(f"{cut} token disc(s) redrawn from assets/icons, "
              f"glyph at {TOKEN_GLYPH:.0%} of the square")
        return 0

    print(f"reading {REPO} at {COMMIT[:12]}")
    by_slug = upstream()
    print(f"  {len(by_slug)} icons upstream")

    os.makedirs(ASSETS, exist_ok=True)
    # The icons an actor can be pictured by are cut twice: a tile for the
    # sheets and a disc for the canvas.
    discs = art.token_icons()
    used: dict[str, str] = {}
    fetched = kept = cut = 0
    for icon in wanted:
        path = resolve(icon, by_slug)
        used[icon] = path
        local = os.path.join(ASSETS, path)
        token = os.path.join(TOKENS, path) if icon in discs else ""

        if (os.path.exists(local) and (not token or os.path.exists(token))
                and not arguments.force):
            kept += 1
            continue
        try:
            svg = fetch(RAW + path).decode("utf-8")
        except urllib.error.HTTPError as error:
            raise SystemExit(f"{path}: {error}") from error

        os.makedirs(os.path.dirname(local), exist_ok=True)
        with open(local, "w", encoding="utf-8") as handle:
            handle.write(restyle(svg, path))
        fetched += 1

        if token:
            os.makedirs(os.path.dirname(token), exist_ok=True)
            with open(token, "w", encoding="utf-8") as handle:
                handle.write(as_token(svg, path))
            cut += 1

    with open(os.path.join(ASSETS, "CREDITS.md"), "w", encoding="utf-8") as handle:
        handle.write(credits(used))

    print(f"{fetched} fetched, {kept} already here, {len(used)} in assets/icons; "
          f"{cut} cut as tokens, {len(discs)} in assets/tokens")
    print("assets/icons/CREDITS.md written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Draw the system's cover art, from the system's own palette.

    python3 tools/gen_cover.py            # write assets/media
    python3 tools/gen_cover.py --check    # fail if it is out of date

The setup screen shows a package's cover image, and this one had none, which
leaves Foundry drawing a grey rectangle where every other system has a picture.

Drawn rather than found, for the same reason the icons are vendored rather than
guessed at: a cover downloaded from somewhere has a licence to keep track of and
a provenance to be sure of, and this system has a visual identity already — ink
on paper, one accent, a five-foot grid. There is nothing here but rectangles,
text and a little noise, so the only licence involved is this repository's own.

The figures on it are read from the packs rather than typed, because a cover
claiming 1,675 documents is a claim, and one that goes stale is worse than one
that is absent.
"""
from __future__ import annotations

import argparse
import glob
import io
import json
import os
import random
import sys

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
except ImportError:  # pragma: no cover - a machine with no Pillow can still
    Image = None     # run every other check, and the artwork is committed.

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

OUT = os.path.join(srd.ROOT, "assets", "media")
COVER = os.path.join(OUT, "cover.webp")
THUMB = os.path.join(OUT, "cover-thumb.webp")

# css/modern20.css, which is where the sheets get theirs.
INK = (28, 26, 23)
MUTED = (107, 100, 92)
RULE = (207, 199, 187)
PAPER = (246, 242, 234)
ACCENT = (140, 47, 30)

SIZE = (1920, 1080)
THUMB_WIDTH = 480

# Rendering text to an image is not redistributing a font, so the only
# requirement here is that the file exists on the machine doing the drawing.
FONTS = {
    "display": ["/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf"],
    "body": ["/usr/share/fonts/truetype/lato/Lato-Medium.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    "mono": ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"],
}


def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for path in FONTS[kind]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise SystemExit(f"no {kind} font on this machine: tried {FONTS[kind]}")


def figures() -> dict[str, str]:
    """What the cover says about the system, counted rather than remembered."""
    packs = os.path.join(srd.ROOT, "src", "packs")
    documents = 0
    pages = 0
    for path in glob.glob(os.path.join(packs, "*", "*.json")):
        with open(path, encoding="utf-8") as handle:
            entry = json.load(handle)
        if entry.get("_key", "").startswith("!folders!"):
            continue
        documents += 1
        pages += len(entry.get("pages") or [])

    with open(os.path.join(srd.ROOT, "data", "coverage.json"), encoding="utf-8") as handle:
        baseline = json.load(handle)
    linked = sum(pack.get("linked", 0) for pack in (baseline.get("links") or {}).values())

    return {
        "documents": f"{documents:,}",
        "pages": f"{pages:,}",
        "linked": f"{linked:,}",
    }


def grain(size: tuple[int, int], strength: int = 6) -> Image.Image:
    """Paper, rather than a flat fill. Deterministic, so the file is stable."""
    generator = random.Random(20)
    noise = Image.new("L", (size[0] // 2, size[1] // 2))
    noise.putdata([generator.randint(128 - strength, 128 + strength)
                   for _ in range(noise.width * noise.height)])
    return noise.resize(size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(0.6))


def draw_cover() -> Image.Image:
    width, height = SIZE

    # The paper itself: two near-whites mixed by the grain, rather than a flat
    # fill that reads as a blank canvas.
    texture = grain(SIZE)
    image = Image.composite(Image.new("RGB", SIZE, PAPER),
                            Image.new("RGB", SIZE, (236, 231, 221)), texture)
    draw = ImageDraw.Draw(image)

    # A five-foot grid across the lower half, faint: this is a system for a
    # game played on one.
    step = 60
    for x in range(0, width + step, step):
        draw.line([(x, height // 2), (x, height)], fill=RULE, width=1)
    for y in range(height // 2, height + step, step):
        draw.line([(0, y), (width, y)], fill=RULE, width=1)
    # Fade the grid into the page rather than ending it on a hard line.
    fade = Image.new("L", SIZE, 0)
    ImageDraw.Draw(fade).rectangle([0, height // 2, width, height], fill=255)
    image = Image.composite(image, Image.new("RGB", SIZE, PAPER),
                            fade.filter(ImageFilter.GaussianBlur(120)))
    draw = ImageDraw.Draw(image)

    margin = 150

    # The eyebrow, the way the sheets set one.
    label = font("mono", 26)
    draw.text((margin, margin), "d 2 0   M O D E R N   S R D", font=label, fill=ACCENT)

    # The title. Condensed and large, because the word is long and the cover is
    # mostly empty on purpose.
    title = font("display", 268)
    draw.text((margin - 8, margin + 74), "MODERN20", font=title, fill=INK)

    rule_y = margin + 420
    draw.line([(margin, rule_y), (width - margin, rule_y)], fill=INK, width=3)

    standfirst = font("body", 46)
    draw.text((margin, rule_y + 34),
              "The d20 Modern System Reference Document,",
              font=standfirst, fill=INK)
    draw.text((margin, rule_y + 92),
              "as a game system for Foundry Virtual Tabletop.",
              font=standfirst, fill=MUTED)

    # The figures, counted from the packs.
    counted = figures()
    stats = [
        (counted["documents"], "documents in 17 compendia"),
        (counted["pages"], "pages of the rules themselves"),
        (counted["linked"], "of them linked to the page they came from"),
    ]
    number_font = font("display", 84)
    caption_font = font("body", 28)
    x = margin
    for number, caption in stats:
        draw.text((x, height - 330), number, font=number_font, fill=ACCENT)
        draw.text((x, height - 224), caption, font=caption_font, fill=MUTED)
        x += max(draw.textlength(number, font=number_font),
                 draw.textlength(caption, font=caption_font)) + 80

    # The licence, small, at the foot — where a book puts it.
    legal = font("mono", 22)
    notice = ("Open Game Content, under the Open Game License v1.0a.  "
              "Not affiliated with Wizards of the Coast.")
    draw.line([(margin, height - 140), (width - margin, height - 140)],
              fill=RULE, width=1)
    draw.text((margin, height - 112), notice, font=legal, fill=MUTED)

    return image


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="fail if the cover is out of date")
    arguments = parser.parse_args()

    if Image is None:
        # The artwork is committed, so its absence from a machine's Python is
        # not a failure: the check simply cannot run. Drawing it does need
        # Pillow, and says so.
        if arguments.check:
            print("skipped: Pillow is not installed, so the cover cannot be redrawn "
                  "to compare it")
            return 0
        raise SystemExit("drawing the cover needs Pillow: pip install pillow")

    image = draw_cover()
    thumb = image.resize((THUMB_WIDTH, round(THUMB_WIDTH * SIZE[1] / SIZE[0])),
                         Image.LANCZOS)

    os.makedirs(OUT, exist_ok=True)
    written = []
    for path, picture in ((COVER, image), (THUMB, thumb)):
        buffer = io.BytesIO()
        picture.save(buffer, format="WEBP", quality=88, method=6)
        drawn = buffer.getvalue()
        current = open(path, "rb").read() if os.path.exists(path) else b""
        if current == drawn:
            continue
        if arguments.check:
            print(f"FAIL  {os.path.relpath(path, srd.ROOT)} is out of date — "
                  "run python3 tools/gen_cover.py")
            return 1
        with open(path, "wb") as handle:
            handle.write(drawn)
        written.append(f"{os.path.relpath(path, srd.ROOT)} "
                       f"({len(drawn) // 1024} KB)")

    if arguments.check:
        print("the cover matches what the packs hold")
        return 0
    print("\n".join(written) if written else "the cover was already current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

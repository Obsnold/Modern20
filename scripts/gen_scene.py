#!/usr/bin/env python3
"""Draw a scene to play on, and the walls that go with it.

    python3 scripts/gen_scene.py            # write the map and src/packs/scenes
    python3 scripts/gen_scene.py --check    # fail if either is out of date

A system ships no adventure, so a new world opens on an empty canvas: nothing
to drop a creature onto, and no way to see that a Gargantuan wyrm really is
four squares of wyrm without first finding a map somewhere.

So: one warehouse, 30 by 20 squares at five feet a square. Drawn here for the
same reason the cover is — a downloaded battlemap is somebody's licence to keep
track of — and drawn *with* its walls, which is the part worth having. The map
and the walls come from one description of the building, so a door is a door in
both: the picture cannot drift from what a token can walk through, because
neither is transcribed from the other.

Nothing in it is a monster or a plot. It is a floor, some walls, four doors and
a stack of crates, which is what a system's example scene should be: somewhere
to try the rules.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_packs  # noqa: E402
import srd  # noqa: E402

MEDIA = os.path.join(srd.ROOT, "assets", "media")
MAP = os.path.join(MEDIA, "warehouse.webp")
OUT = os.path.join(srd.ROOT, "src", "packs", "scenes")

# Five feet a square, a hundred pixels a square: the size Foundry's own default
# grid expects, so a token dropped on it is the size the stat block says.
SQUARE = 100
GRID_FEET = 5
WIDE, HIGH = 30, 20

# Concrete, paint and steel, kept in the same family as the system's palette.
FLOOR = (188, 184, 176)
FLOOR_DARK = (168, 164, 156)
WALL = (58, 55, 50)
WALL_EDGE = (38, 36, 32)
LINE = (214, 176, 88)          # the yellow paint on a warehouse floor
CRATE = (146, 110, 68)
CRATE_EDGE = (104, 76, 46)
OFFICE = (206, 200, 188)
DOOR = (150, 96, 58)
GLASS = (176, 196, 200)

# The building, in squares. One description, drawn twice: once as a picture and
# once as walls.
#
# Each wall is a run of segments; a door is a segment Foundry can open.
OFFICE_BOX = (0, 0, 8, 6)      # left, top, right, bottom — the office corner
BAY = (WIDE - 3, 6, WIDE, 14)  # the loading bay, open to the yard

CRATE_STACKS = [
    (11, 3, 2, 2), (14, 4, 1, 3), (11, 13, 3, 2), (16, 15, 2, 2),
    (20, 3, 2, 3), (23, 8, 2, 2), (19, 12, 3, 2), (25, 15, 2, 2),
]

PILLARS = [(10, 9), (15, 9), (20, 9), (25, 9)]


def squares(*values: float) -> list[float]:
    return [value * SQUARE for value in values]


def concrete() -> Image.Image:
    """A floor with something in it, so the grid is not drawn on flat grey."""
    width, height = WIDE * SQUARE, HIGH * SQUARE
    generator = random.Random(30)
    noise = Image.new("L", (width // 4, height // 4))
    noise.putdata([generator.randint(112, 144)
                   for _ in range(noise.width * noise.height)])
    noise = noise.resize((width, height), Image.BILINEAR)
    noise = noise.filter(ImageFilter.GaussianBlur(1.5))
    floor = Image.composite(Image.new("RGB", (width, height), FLOOR),
                            Image.new("RGB", (width, height), FLOOR_DARK), noise)

    draw = ImageDraw.Draw(floor)
    # Expansion joints, every five squares, the way a poured floor is cast.
    for x in range(5 * SQUARE, width, 5 * SQUARE):
        draw.line([(x, 0), (x, height)], fill=FLOOR_DARK, width=3)
    for y in range(5 * SQUARE, height, 5 * SQUARE):
        draw.line([(0, y), (width, y)], fill=FLOOR_DARK, width=3)
    return floor


def draw_map() -> Image.Image:
    image = concrete()
    draw = ImageDraw.Draw(image)
    width, height = image.size

    # The loading bay: painted hatching on the floor, where a truck backs in.
    # Drawn into a patch of its own and pasted, because a diagonal drawn
    # straight onto the floor runs past the bay and over the wall behind it.
    left, top, right, bottom = (int(value) for value in squares(*BAY))
    patch = Image.new("RGB", (right - left, bottom - top), FLOOR_DARK)
    hatch = ImageDraw.Draw(patch)
    for offset in range(-patch.height, patch.width + patch.height, 70):
        hatch.line([(offset, patch.height), (offset + patch.height, 0)],
                   fill=LINE, width=7)
    image.paste(patch, (left, top))
    draw = ImageDraw.Draw(image)

    # A walkway down the middle, painted.
    walk_y = 9.5 * SQUARE
    draw.line([(OFFICE_BOX[2] * SQUARE, walk_y), (width - 3 * SQUARE, walk_y)],
              fill=LINE, width=8)

    # The office, floored differently because it is a different room, with
    # enough in it to read as a room somebody works in.
    left, top, right, bottom = squares(*OFFICE_BOX)
    draw.rectangle([left, top, right, bottom], fill=OFFICE)
    draw.rectangle([left + 0.6 * SQUARE, top + 0.6 * SQUARE,
                    left + 3.4 * SQUARE, top + 1.8 * SQUARE],
                   fill=CRATE, outline=CRATE_EDGE, width=4)          # a desk
    draw.rectangle([left + 4.2 * SQUARE, top + 0.6 * SQUARE,
                    left + 5.4 * SQUARE, top + 1.4 * SQUARE],
                   fill=OFFICE, outline=WALL, width=4)               # cabinets
    draw.rectangle([left + 0.6 * SQUARE, top + 3.4 * SQUARE,
                    left + 2.6 * SQUARE, top + 5.2 * SQUARE],
                   fill=OFFICE, outline=WALL, width=4)               # a table
    # Its window onto the floor, which is glass rather than wall.
    draw.rectangle([right - 14, 1.5 * SQUARE, right + 14, 4.5 * SQUARE], fill=GLASS)

    # Crates: a top-down box is a rectangle with a cross on it.
    for x, y, box_wide, box_high in CRATE_STACKS:
        left, top = x * SQUARE, y * SQUARE
        right, bottom = left + box_wide * SQUARE, top + box_high * SQUARE
        draw.rectangle([left + 6, top + 6, right - 6, bottom - 6],
                       fill=CRATE, outline=CRATE_EDGE, width=5)
        draw.line([(left + 6, top + 6), (right - 6, bottom - 6)],
                  fill=CRATE_EDGE, width=3)
        draw.line([(right - 6, top + 6), (left + 6, bottom - 6)],
                  fill=CRATE_EDGE, width=3)

    # Pillars holding the roof up, which are cover in a firefight.
    for x, y in PILLARS:
        left, top = x * SQUARE + 30, y * SQUARE + 30
        draw.rectangle([left, top, left + 40, top + 40],
                       fill=WALL, outline=WALL_EDGE, width=3)

    # The shell, drawn last so nothing overlaps it.
    thickness = 18
    draw.rectangle([0, 0, width - 1, height - 1], outline=WALL, width=thickness)
    # The office walls, with a doorway left open where the door is.
    left, top, right, bottom = squares(*OFFICE_BOX)
    draw.rectangle([left, top, right, bottom], outline=WALL, width=thickness)
    draw.rectangle([right - thickness // 2, 4.6 * SQUARE,
                    right + thickness // 2, 5.6 * SQUARE], fill=OFFICE)
    draw.rectangle([right - 8, 4.7 * SQUARE, right + 8, 5.5 * SQUARE], fill=DOOR)

    # The roller doors: two on the bay wall, one personnel door at the front.
    for gap_top, gap_bottom in ((6.2, 9.8), (10.2, 13.8)):
        draw.rectangle([width - thickness, gap_top * SQUARE,
                        width, gap_bottom * SQUARE], fill=DOOR)
        # The slats, so a roller door looks like one from above.
        for slat in range(int(gap_top * SQUARE) + 12, int(gap_bottom * SQUARE), 22):
            draw.line([(width - thickness, slat), (width, slat)],
                      fill=WALL_EDGE, width=2)
    draw.rectangle([2.2 * SQUARE, height - thickness, 4.2 * SQUARE, height],
                   fill=DOOR)
    return image


def wall(x0: float, y0: float, x1: float, y1: float, *, door: int = 0) -> dict:
    """One wall segment, in pixels, as Foundry stores it.

    move and sense are both 20 — CONST.WALL_MOVEMENT_TYPES.NORMAL and
    CONST.WALL_SENSE_TYPES.NORMAL — which is an ordinary wall: it stops
    movement and it blocks sight.
    """
    return {
        "_id": build_packs.document_id("scenes", f"wall-{x0}-{y0}-{x1}-{y1}")[:16],
        "c": [round(x0), round(y0), round(x1), round(y1)],
        "move": 20, "sense": 20, "sound": 20, "light": 20,
        "dir": 0, "door": door, "ds": 0,
    }


def walls() -> list[dict]:
    """The same building, as segments a token cannot walk through.

    Written from the same numbers the picture is drawn from, which is the whole
    point of drawing it: a door in the wall list is a door in the paint.
    """
    width, height = WIDE * SQUARE, HIGH * SQUARE
    out = []

    # The shell, broken where the doors are.
    out.append(wall(0, 0, width, 0))                       # back
    out.append(wall(0, 0, 0, height))                      # left
    # The front, with a personnel door between 2.2 and 4.2 squares.
    out.append(wall(0, height, 2.2 * SQUARE, height))
    out.append(wall(2.2 * SQUARE, height, 4.2 * SQUARE, height, door=1))
    out.append(wall(4.2 * SQUARE, height, width, height))
    # The bay wall, with two roller doors.
    out.append(wall(width, 0, width, 6.2 * SQUARE))
    out.append(wall(width, 6.2 * SQUARE, width, 9.8 * SQUARE, door=1))
    out.append(wall(width, 9.8 * SQUARE, width, 10.2 * SQUARE))
    out.append(wall(width, 10.2 * SQUARE, width, 13.8 * SQUARE, door=1))
    out.append(wall(width, 13.8 * SQUARE, width, height))

    # The office: two interior walls, with a window and a door in them.
    left, top, right, bottom = squares(*OFFICE_BOX)
    out.append(wall(right, top, right, 1.5 * SQUARE))
    # The window blocks movement and not sight, which is what a window is.
    window = wall(right, 1.5 * SQUARE, right, 4.5 * SQUARE)
    window["sense"] = 0
    window["light"] = 0
    out.append(window)
    out.append(wall(right, 4.5 * SQUARE, right, 4.6 * SQUARE))
    out.append(wall(right, 4.6 * SQUARE, right, 5.6 * SQUARE, door=1))
    out.append(wall(right, 5.6 * SQUARE, right, bottom))
    out.append(wall(left, bottom, right, bottom))

    # The pillars, each a square of four segments.
    for x, y in PILLARS:
        px, py = x * SQUARE + 30, y * SQUARE + 30
        out.append(wall(px, py, px + 40, py))
        out.append(wall(px + 40, py, px + 40, py + 40))
        out.append(wall(px + 40, py + 40, px, py + 40))
        out.append(wall(px, py + 40, px, py))
    return out


def lights() -> list[dict]:
    """Four lights in the roof, so the scene is lit before anybody lights it."""
    out = []
    for index, (x, y) in enumerate(((7, 4), (15, 6), (22, 6), (15, 15))):
        out.append({
            "_id": build_packs.document_id("scenes", f"light-{index}")[:16],
            "x": x * SQUARE, "y": y * SQUARE,
            "rotation": 0, "walls": True, "vision": False,
            "config": {
                "negative": False, "priority": 0,
                "alpha": 0.35, "angle": 360,
                "bright": 6 * SQUARE / 2, "dim": 12 * SQUARE / 2,
                "coloration": 1, "luminosity": 0.5,
                "saturation": 0, "contrast": 0, "shadows": 0,
                "animation": {"type": None, "speed": 5, "intensity": 5, "reverse": False},
                "darkness": {"min": 0, "max": 1},
            },
            "hidden": False,
        })
    return out


def scene() -> dict:
    slug = "warehouse"
    doc_id = build_packs.document_id("scenes", slug)
    return {
        "_id": doc_id,
        "name": "Warehouse (example)",
        "navigation": True,
        "navName": "Warehouse",
        "width": WIDE * SQUARE,
        "height": HIGH * SQUARE,
        "padding": 0.1,
        "initial": {"x": WIDE * SQUARE // 2, "y": HIGH * SQUARE // 2, "scale": 0.5},
        "background": {"src": "systems/modern20/assets/media/warehouse.webp"},
        "grid": {"type": 1, "size": SQUARE, "distance": GRID_FEET, "units": "ft",
                 "style": "solidLines", "thickness": 1,
                 "color": "#000000", "alpha": 0.12},
        # Everything is visible from the start: a system's example scene is for
        # trying the rules on, not for running a stealth mission, and token
        # vision would hide the map behind a fog nobody asked for.
        "tokenVision": False,
        "fogExploration": False,
        "walls": walls(),
        "lights": lights(),
        "_key": f"!scenes!{doc_id}",
        "_slug": slug,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="fail if the map or the scene is out of date")
    arguments = parser.parse_args()

    image = draw_map()
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=86, method=6)
    drawn = buffer.getvalue()

    document = scene()
    text = json.dumps(document, indent=2, ensure_ascii=False) + "\n"
    path = os.path.join(OUT, f"{document['_slug']}.json")

    stale = []
    if not os.path.exists(MAP) or open(MAP, "rb").read() != drawn:
        stale.append("assets/media/warehouse.webp")
    if not os.path.exists(path) or open(path, encoding="utf-8").read() != text:
        stale.append(f"src/packs/scenes/{document['_slug']}.json")

    if arguments.check:
        for name in stale:
            print(f"FAIL  {name} is out of date — run python3 scripts/gen_scene.py")
        if stale:
            return 1
        print(f"the warehouse and its {len(document['walls'])} walls are current")
        return 0

    os.makedirs(MEDIA, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    with open(MAP, "wb") as handle:
        handle.write(drawn)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)

    print(f"assets/media/warehouse.webp ({len(drawn) // 1024} KB, "
          f"{image.width}x{image.height}, {WIDE}x{HIGH} squares)")
    print(f"src/packs/scenes/{document['_slug']}.json "
          f"({len(document['walls'])} walls, {len(document['lights'])} lights)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

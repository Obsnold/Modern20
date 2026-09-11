#!/usr/bin/env python3
"""Fail if capturing edits out of Foundry stops doing what it claims.

scripts/capture_edits.py is the only path content takes back out of Foundry,
and it runs against a live host, so it is the one script here that cannot be
tried out cheaply. Both of its bugs so far were found by running it against
the real compendia and reading 1,400 documents' worth of output: a renamed
creature filed as a second creature, and a folder made in Foundry left behind
so everything in it landed in the compendium root.

This builds a pack source and a matching "unpacked from Foundry" copy in a
temporary directory, edits the copy the way a session at the keyboard would,
and checks what comes home.

    python3 scripts/check_capture.py
"""
import contextlib
import io
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import capture_edits  # noqa: E402

FOLDER = "aaaaaaaaaaaaaaaa"
GOBLIN = "bbbbbbbbbbbbbbbb"
CLUB = "cccccccccccccccc"
WIDGET = "dddddddddddddddd"


def pack_source(root: str) -> None:
    """A pack source of two packs: creatures, grouped, and ungrouped gear."""
    os.makedirs(os.path.join(root, "creatures"))
    os.makedirs(os.path.join(root, "gear"))

    write(root, "creatures", "folder-d20-modern", {
        "_id": FOLDER, "name": "d20 Modern", "type": "Actor", "sorting": "a",
        "folder": None, "color": None, "sort": 0, "flags": {},
        "_key": f"!folders!{FOLDER}",
    })
    write(root, "creatures", "goblin", {
        "_id": GOBLIN, "name": "Goblin", "type": "creature", "folder": FOLDER,
        # The build derives a prototype token now, so it is a field of the
        # document rather than a default Foundry fills in — which means a GM
        # resizing a token is an edit like any other, and has to come home.
        "prototypeToken": {"width": 1, "height": 1, "disposition": -1,
                           "bar1": {"attribute": "hp"}},
        "system": {"attributes": {"hp": {"value": 5}}, "description": "<p>A goblin.</p>"},
        "items": [{"_id": CLUB, "name": "Club", "type": "weapon",
                   "system": {"damage": "1d6"},
                   "_key": f"!actors.items!{GOBLIN}.{CLUB}"}],
        "_key": f"!actors!{GOBLIN}",
    })
    write(root, "gear", "widget", {
        "_id": WIDGET, "name": "Widget", "type": "gear",
        "system": {"purchaseDC": 5}, "_key": f"!items!{WIDGET}",
    })


def write(root: str, pack: str, stem: str, document: dict) -> None:
    with open(os.path.join(root, pack, f"{stem}.json"), "w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2)


def live_copy(source: str, destination: str) -> None:
    """What the Foundry CLI hands back: the same documents, named its way.

    It names files after the document rather than after the SRD entry the
    build named them for - Steel_Door_XimGy4KBgx6z72sc.json - which is why
    nothing here matches on the file name.
    """
    for pack in os.listdir(source):
        os.makedirs(os.path.join(destination, pack))
        for name in os.listdir(os.path.join(source, pack)):
            with open(os.path.join(source, pack, name), encoding="utf-8") as handle:
                document = json.load(handle)
            # Foundry fills in the defaults a document does not carry, and
            # stamps who touched it last. Neither is an edit.
            document.setdefault("prototypeToken", {})
            document["prototypeToken"].setdefault("sight", {"enabled": False})
            document["prototypeToken"].setdefault("light", {"dim": 0, "bright": 0})
            document["_stats"] = {"lastModifiedBy": "someone"}
            document["ownership"] = {"default": 0}
            stem = document["name"].replace(" ", "_") + "_" + document["_id"]
            write(destination, pack, stem, document)


def edit(live: str) -> None:
    """One session in Foundry, as the sheets would leave it."""
    path = os.path.join(live, "creatures", f"Goblin_{GOBLIN}.json")
    with open(path, encoding="utf-8") as handle:
        goblin = json.load(handle)

    # Renamed, given a hit point, and its club sharpened. Same id throughout:
    # this is the creature that was there, not a new one.
    goblin["name"] = "Goblin Scout"
    goblin["system"]["attributes"]["hp"]["value"] = 6
    goblin["items"][0]["system"]["damage"] = "1d8"
    # And its token dragged out to two squares, which is a GM deciding this
    # goblin is bigger than the book says.
    goblin["prototypeToken"]["width"] = 2
    goblin["prototypeToken"]["height"] = 2
    # The editor reflows any HTML it opens. Not an edit.
    goblin["system"]["description"] = "<p>A goblin.</p>  "
    os.remove(path)
    write(live, "creatures", f"Goblin_Scout_{GOBLIN}", goblin)

    # A folder made in Foundry, with a creature made in Foundry inside it -
    # and the goblin dragged into it, which is an edit like any other.
    new_folder = "eeeeeeeeeeeeeeee"
    goblin["folder"] = new_folder
    write(live, "creatures", f"Goblin_Scout_{GOBLIN}", goblin)
    write(live, "creatures", f"House_Rules_{new_folder}", {
        "_id": new_folder, "name": "House Rules", "type": "Actor",
        "sorting": "a", "folder": None, "color": "#884444", "sort": 0,
        "flags": {}, "_key": f"!folders!{new_folder}",
    })
    write(live, "creatures", "Sump_Wraith_ffffffffffffffff", {
        "_id": "ffffffffffffffff", "name": "Sump Wraith", "type": "creature",
        "folder": new_folder, "system": {"attributes": {"hp": {"value": 12}}},
        "items": [{"_id": "gggggggggggggggg", "name": "Grasp", "type": "weapon",
                   "system": {"damage": "1d4"}, "_stats": {"lastModifiedBy": "x"}}],
        "_stats": {"lastModifiedBy": "someone"}, "ownership": {"default": 0},
    })

    # And one made in Foundry that was never filed anywhere.
    write(live, "creatures", "Loose_Beast_hhhhhhhhhhhhhhhh", {
        "_id": "hhhhhhhhhhhhhhhh", "name": "Loose Beast", "type": "creature",
        "folder": None, "system": {"attributes": {"hp": {"value": 3}}},
    })

    # And a deletion, which must never be acted on.
    os.remove(os.path.join(live, "gear", f"Widget_{WIDGET}.json"))


def at(document: dict, *path: str):
    """A nested value, or nothing where any step of the way is absent."""
    for step in path:
        if not isinstance(document, dict):
            return None
        document = document.get(step)
    return document


def child(document: dict, *path: str):
    """The same, of a document's first embedded item."""
    return at(((document.get("items") or [{}])[0]), *path)


def load(path: str) -> dict:
    """A file the capture should have written, or nothing if it did not.

    Nothing, rather than an exception: a check that stops at the first missing
    file reports one failure and hides the rest, and this one is here to say
    what a whole editing session lost.
    """
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    root = tempfile.mkdtemp(prefix="modern20-check-capture-")
    packs, live = os.path.join(root, "packs"), os.path.join(root, "live")
    problems = []

    def want(condition, message):
        if not condition:
            problems.append(message)

    try:
        pack_source(packs)
        live_copy(packs, live)
        edit(live)

        capture_edits.PACKS = packs
        capture_edits.OVERRIDES = os.path.join(root, "overrides")
        output = io.StringIO()
        argv = sys.argv
        sys.argv = ["capture_edits.py", "--from", live]
        try:
            with contextlib.redirect_stdout(output):
                capture_edits.main()
        finally:
            sys.argv = argv
        said = output.getvalue()

        files = sorted(os.listdir(os.path.join(packs, "creatures")))
        want("goblin.json" in files,
             "the renamed creature was written somewhere other than its own file")
        want("goblin-scout.json" not in files,
             "renaming a creature in Foundry filed a second copy of it")

        goblin = load(os.path.join(packs, "creatures", "goblin.json"))
        want(goblin.get("name") == "Goblin Scout", "the rename was not captured")
        want(at(goblin, "system", "attributes", "hp", "value") == 6,
             "the edited hit points were not captured")
        want(child(goblin, "system", "damage") == "1d8",
             "the edit to an embedded item was not captured")
        want(at(goblin, "prototypeToken", "width") == 2
             and at(goblin, "prototypeToken", "height") == 2,
             "a token resized in Foundry came back the size the book gives it")
        want("light" not in (goblin.get("prototypeToken") or {}),
             "Foundry's own token defaults came home with the document")
        want(goblin.get("_key") == f"!actors!{GOBLIN}", "the document's key was rewritten")
        want(goblin.get("folder") == "eeeeeeeeeeeeeeee",
             "a creature dragged into another folder came back where it was")
        want("folder" not in (goblin.get("system") or {}),
             "the folder was written into the creature's system data")

        overrides = load(os.path.join(root, "overrides", "creatures.json"))
        want("goblin" in overrides, "the edit was not recorded as a divergence")
        want("why" in overrides.get("goblin", {}),
             "a captured edit was recorded without asking why")
        want("description" not in json.dumps(overrides.get("goblin", {})),
             "reflowed HTML was captured as an edit")

        want("folder-house-rules.json" in files,
             "a folder made in Foundry was left behind")
        want("sump-wraith.json" in files,
             "a creature made in Foundry was left behind")
        wraith = load(os.path.join(packs, "creatures", "sump-wraith.json"))
        want(wraith.get("_key") == "!actors!ffffffffffffffff",
             "a creature made in Foundry was keyed wrongly")
        want(child(wraith, "_key") == "!actors.items!ffffffffffffffff.gggggggggggggggg",
             "an embedded item of a creature made in Foundry was keyed wrongly")
        want("_stats" not in wraith and "ownership" not in wraith,
             "Foundry's bookkeeping came home with the document")
        want("_stats" not in (wraith.get("items") or [{}])[0],
             "Foundry's bookkeeping came home with an embedded item")
        folder = load(os.path.join(packs, "creatures", "folder-house-rules.json"))
        want(folder.get("_key") == "!folders!eeeeeeeeeeeeeeee", "a new folder was keyed wrongly")

        want("Loose Beast is outside the pack's folders" in said,
             "a document left outside the folders was not reported, and the "
             "next deploy would fail on it")
        want(os.path.exists(os.path.join(packs, "gear", "widget.json")),
             "a document missing from Foundry was deleted from the pack source")
        want("Widget is in the pack source but not in Foundry" in said,
             "a document missing from Foundry was not reported")

        # Nothing edited must be nothing captured, or every deploy carries noise.
        second = io.StringIO()
        live_again = os.path.join(root, "live2")
        live_copy(packs, live_again)
        sys.argv = ["capture_edits.py", "--from", live_again, "--exit-code"]
        try:
            with contextlib.redirect_stdout(second):
                code = capture_edits.main()
        finally:
            sys.argv = argv
        want(code == 0, f"an unedited pack reported changes:\n{second.getvalue()}")
    finally:
        shutil.rmtree(root, ignore_errors=True)

    for problem in problems:
        print(f"FAIL  {problem}")
    print(f"\ncapture: one editing session round-tripped, {len(problems)} failures")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

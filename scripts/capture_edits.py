#!/usr/bin/env python3
"""Capture edits made in Foundry back into data/overrides/packs/.

src/packs is the source of truth and Foundry is an editor for it, so an edit
made on a sheet has to come home. This reads the live packs back off the host,
compares them with the pack source, and writes the changed documents into it -
along with a note in data/overrides/packs/ saying which documents now
deliberately differ from the SRD, and why.

    scripts/capture_edits.py                     # pull from the Foundry host
    scripts/capture_edits.py --from /tmp/src     # compare an unpacked copy
    scripts/capture_edits.py --dry-run           # say what changed, write nothing
    scripts/capture_edits.py --dry-run --exit-code   # fail if anything has

Only fields the build actually sets are compared. Foundry fills in every
default a document does not carry - empty effects, the whole light
configuration, the token fields the build leaves alone - and none of that is an
edit. Which cuts the other way as the build sets more: a prototype token is
derived and stored now, so a token resized in Foundry is an edit and comes
home. HTML is compared
normalised, because the editor rewrites `<br />` as `<br>` and reflows
whitespace on any page it opens, which is not an edit either.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_packs import apply_document_override  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = os.path.join(ROOT, "src", "packs")
OVERRIDES = os.path.join(ROOT, "data", "overrides", "packs")

# Where the live compendia are, from the environment: every one of these is a
# fact about somebody's own machine, and a repository that names the host it
# was deployed to from one person's laptop tells everybody else something
# untrue. The defaults are conventions — a packaged Foundry on Linux keeps its
# data in /var/lib/foundryvtt, and `fvtt` on PATH is what the CLI installs as.
DEFAULT_HOST = os.environ.get("MODERN20_HOST", "")
REMOTE_PACKS = os.environ.get(
    "MODERN20_DEST", "/var/lib/foundryvtt/Data/systems/modern20") + "/packs"
REMOTE_CLI = os.environ.get("MODERN20_FVTT", "fvtt")
NODE_BIN = os.environ.get("MODERN20_NODE_BIN", "")

# Bookkeeping Foundry owns, which differs every time and means nothing here.
SKIP = {"_id", "_key", "_slug", "_stats", "ownership", "sort", "folder"}

# The embedded collections, which are compared document by document rather
# than as one value. Foundry fills an effect out with a duration, a tint, a
# description and a dozen other defaults the build does not set, so an effect
# compared whole differs on every round trip and every feat that carries one
# would come home reporting an edit nobody made.
EMBEDDED_FIELDS = ("items", "pages", "effects")

# Dropped from a document brought back whole. The Foundry CLI calls these
# volatile and drops them too: they say who last touched the document and when,
# which is git's job here.
VOLATILE = {"_stats", "ownership"}

# What a compiled pack keys each kind of document under.
COLLECTIONS = {"creatures": "actors", "vehicles": "actors", "objects": "actors",
               "rules": "journal"}


def pull(host: str, destination: str) -> None:
    """Unpack the live compendia on the host and bring the JSON back.

    Foundry holds the LevelDB open, so the packs are copied before they are
    read. Everything happens under /tmp on the host and is cleared afterwards.
    """
    script = f"""set -e
export PATH={NODE_BIN + ":" if NODE_BIN else ""}$PATH
rm -rf /tmp/modern20-live /tmp/modern20-src
mkdir -p /tmp/modern20-live /tmp/modern20-src
sudo -n cp -r {REMOTE_PACKS}/. /tmp/modern20-live/
sudo -n chown -R "$(id -un)":"$(id -gn)" /tmp/modern20-live
for p in $(ls /tmp/modern20-live); do
  {REMOTE_CLI} package unpack -n "$p" --in /tmp/modern20-live --out /tmp/modern20-src/"$p" >/dev/null 2>&1 || echo "  ! could not unpack $p" >&2
done
cd /tmp/modern20-src && tar czf /tmp/modern20-src.tgz .
"""
    subprocess.run(["ssh", "-o", "BatchMode=yes", host, "bash", "-s"],
                   input=script, text=True, check=True)
    archive = os.path.join(destination, "packs.tgz")
    subprocess.run(["scp", "-q", "-o", "BatchMode=yes",
                    f"{host}:/tmp/modern20-src.tgz", archive], check=True)
    subprocess.run(["tar", "xzf", archive, "-C", destination], check=True)
    os.remove(archive)
    subprocess.run(["ssh", "-o", "BatchMode=yes", host,
                    "rm -rf /tmp/modern20-live /tmp/modern20-src /tmp/modern20-src.tgz"],
                   check=False)


def normalise(value):
    """A value as it can be compared: 3.0 is 3, and HTML is its own shape."""
    if isinstance(value, float) and value == int(value):
        return int(value)
    if isinstance(value, str) and "<" in value:
        text = re.sub(r"<(br|hr|img)([^>]*?)\s*/>", r"<\1\2>", value)
        text = re.sub(r"\s+", " ", text)
        return re.sub(r">\s+<", "><", text).strip()
    if isinstance(value, list):
        return [normalise(item) for item in value]
    return value


def flatten(document: dict, prefix: str = "") -> dict:
    """Every leaf the build set, as a dotted path."""
    out = {}
    for key, value in (document or {}).items():
        if key in SKIP or key in EMBEDDED_FIELDS:
            continue
        path = f"{prefix}{key}"
        if isinstance(value, dict) and value:
            out.update(flatten(value, path + "."))
        else:
            out[path] = normalise(value)
    return out


def at(document: dict, path: str):
    """The live value at a dotted path, or nothing where the field is absent."""
    current = document
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return KeyError
        current = current[part]
    return normalise(current)


def differences(built: dict, live: dict) -> dict:
    """What was changed on one document, as the override that restores it."""
    override: dict = {}
    for path, was in flatten(built).items():
        now = at(live, path)
        if now is KeyError or now == was:
            continue
        field, _, rest = path.partition(".")
        if field == "system" and rest:
            override.setdefault("system", {})[rest] = now
        else:
            # Anything outside system - a name, an image, a journal page's
            # text - is addressed from the document itself.
            override[path] = now

    # Where a document sits is content: dragging a creature into a folder in
    # Foundry meant something, and a build that groups a pack by book only
    # ever sets `folder` on the documents it made. `sort` is not content -
    # Foundry renumbers it whenever anything is created or moved - so that
    # stays in SKIP. Children have no folder, so this reads as no change.
    if built.get("folder") != live.get("folder"):
        override["folder"] = live.get("folder")

    for collection in EMBEDDED_FIELDS:
        by_id = {child["_id"]: child for child in (built.get(collection) or [])}
        for child in live.get(collection) or []:
            was_child = by_id.get(child.get("_id"))
            if not was_child:
                continue
            changed = differences(was_child, child)
            changed.pop("why", None)
            if changed:
                # Children are addressed by name: an id means nothing to a
                # reader, and the name is what the sheet shows.
                flat = {}
                for key, value in changed.items():
                    if key == "system":
                        flat.update({f"system.{path}": setting
                                     for path, setting in value.items()})
                    else:
                        flat[key] = value
                override.setdefault(collection, {})[was_child.get("name")] = flat
    return override


def built_documents(pack: str) -> tuple[dict, dict, set[str]]:
    """The pack's own documents, by id and by name, and its folder ids.

    By id first, because that is what a document is on both sides: rename a
    creature on its sheet and it is still that creature, but matched on the
    name alone the rename reads as a document Foundry invented and the pack
    ends up holding two of it. By name as well, for a document whose id
    Foundry replaced.

    The file stem rides along because that is a document's identity here - the
    build names files from the SRD entry id, which is neither the display name
    nor a slug of it, and writing to the wrong one creates a second copy.
    """
    directory = os.path.join(PACKS, pack)
    if not os.path.isdir(directory):
        return {}, {}, set()
    by_id, by_name, folders = {}, {}, set()
    for name in sorted(os.listdir(directory)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(directory, name), encoding="utf-8") as handle:
            document = json.load(handle)
        if document.get("_key", "").startswith("!folders!"):
            folders.add(document["_id"])
            continue
        by_id[document["_id"]] = (name[:-5], document)
        by_name[document["name"]] = (name[:-5], document)
    return by_id, by_name, folders


def is_folder(document: dict) -> bool:
    """Compendium folders are documents in the pack like any other."""
    return document.get("_key", "").startswith("!folders!")


def file_stem(pack: str, document: dict) -> str:
    """A file name for a document that has never had one.

    The build names its files after the SRD entry; a document made in Foundry
    has no SRD entry, so it is named after itself. A folder is prefixed the
    way the built folders are, so a directory listing still reads as one.
    """
    slug = re.sub(r"[^a-z0-9]+", "-", document["name"].lower()).strip("-")
    slug = slug or document["_id"].lower()
    if is_folder(document):
        slug = f"folder-{slug}"

    # Two different documents can slug to the same thing - "Steel Door" and
    # "Steel-Door" - and the second would silently overwrite the first.
    stem, suffix = slug, 2
    while os.path.exists(os.path.join(PACKS, pack, f"{stem}.json")):
        stem = f"{slug}-{suffix}"
        suffix += 1
    return stem


def write_new(pack: str, document: dict) -> str:
    """A document made in Foundry, written into the pack source.

    Kept as Foundry has it, minus what the Foundry CLI itself calls volatile -
    who touched it last and who may see it - and with the compendium key the
    compiler needs, which an unpacked document does not carry.
    """
    document = {key: value for key, value in document.items() if key not in VOLATILE}
    collection = "folders" if is_folder(document) else COLLECTIONS.get(pack, "items")
    document["_key"] = f"!{collection}!{document['_id']}"

    for field in ("items", "pages"):
        for child in document.get(field) or []:
            for key in VOLATILE:
                child.pop(key, None)
            child["_key"] = f"!{collection}.{field}!{document['_id']}.{child['_id']}"

    stem = file_stem(pack, document)
    path = os.path.join(PACKS, pack, f"{stem}.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(f"  wrote src/packs/{pack}/{stem}.json")
    return stem


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("host", nargs="?", default=DEFAULT_HOST,
                        help="user@host of the Foundry server, or set "
                             "MODERN20_HOST")
    parser.add_argument("--from", dest="source", help="an already-unpacked copy")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--exit-code", action="store_true",
                        help="exit 1 if the live packs hold anything the pack "
                             "source does not, the way `git diff --exit-code` "
                             "does; for scripts that must not overwrite an edit")
    parser.add_argument("--no-new", action="store_true",
                        help="report documents that exist only in Foundry rather "
                             "than bringing them into the pack source")
    args = parser.parse_args()

    temporary = None
    source = args.source
    if not source and not args.host:
        print("No host to read from. Pass one, or set MODERN20_HOST:\n"
              "    python3 scripts/capture_edits.py user@host\n"
              "    export MODERN20_HOST=user@host\n"
              "Or point at an already-unpacked copy with --from.", file=sys.stderr)
        return 2
    if not source:
        temporary = tempfile.mkdtemp(prefix="modern20-capture-")
        source = temporary
        print(f"Reading the live compendia from {args.host}")
        pull(args.host, source)

    captured = 0
    write_back: list[tuple[str, str, dict]] = []
    new_documents: list[tuple[str, dict]] = []
    folders_known: dict[str, set[str]] = {}
    missing: list[str] = []
    try:
        for pack in sorted(os.listdir(source)):
            directory = os.path.join(source, pack)
            if not os.path.isdir(directory):
                continue
            by_id, by_name, folders_known[pack] = built_documents(pack)
            overrides = {}
            seen: set[str] = set()

            for name in sorted(os.listdir(directory)):
                if not name.endswith(".json"):
                    continue
                with open(os.path.join(directory, name), encoding="utf-8") as handle:
                    live = json.load(handle)

                # A folder made in Foundry is a document the pack needs too:
                # without it every creature filed into it points at a folder
                # the compendium does not have, and lands in the root.
                if is_folder(live):
                    if live["_id"] not in folders_known[pack] and not args.no_new:
                        new_documents.append((pack, live))
                    continue

                found = by_id.get(live.get("_id")) or by_name.get(live.get("name"))
                if not found:
                    # Something made in Foundry rather than imported. With the
                    # pack as the source of truth it belongs here too, which is
                    # what every other system's extract does.
                    if args.no_new:
                        print(f"  ? {pack}/{live.get('name')} is only in Foundry "
                              "(--no-new, left there)")
                    else:
                        new_documents.append((pack, live))
                    continue
                stem, was = found
                seen.add(stem)

                override = differences(was, live)
                if override:
                    overrides[stem] = {
                        "why": "TODO: say why this differs from the SRD",
                        **override,
                    }
                    write_back.append((pack, stem, override))
                    captured += 1
                    for field in override:
                        print(f"  + {pack}/{live['name']}: {field}")

            # Deleting is never guessed at: a compendium that failed to
            # unpack, or a pack pulled before it was deployed, would read as
            # every document in it having been deleted.
            missing += [f"{pack}/{was['name']}" for stem, was in by_id.values()
                        if stem not in seen]

            # The edit belongs in the pack source, which is what compiles and
            # what a reader reads. Applied onto the document already there
            # rather than taking Foundry's copy wholesale, so the file keeps
            # its own shape - Foundry's copy carries a light configuration, a
            # detection-mode list and a dozen other defaults we do not store.
            if write_back and not args.dry_run:
                for pack_name, slug, override in write_back:
                    path = os.path.join(PACKS, pack_name, f"{slug}.json")
                    with open(path, encoding="utf-8") as handle:
                        document = json.load(handle)
                    apply_document_override(document, override)
                    with open(path, "w", encoding="utf-8") as handle:
                        json.dump(document, handle, indent=2, ensure_ascii=False)
                        handle.write("\n")
                    print(f"  wrote src/packs/{pack_name}/{slug}.json")
                write_back.clear()

            if overrides and not args.dry_run:
                os.makedirs(OVERRIDES, exist_ok=True)
                path = os.path.join(OVERRIDES, f"{pack}.json")
                existing = {}
                if os.path.exists(path):
                    with open(path, encoding="utf-8") as handle:
                        existing = json.load(handle)
                # An override already written keeps the reason it was given.
                for slug, override in overrides.items():
                    reason = existing.get(slug, {}).get("why", "")
                    if reason and not reason.startswith("TODO"):
                        override["why"] = reason
                existing.update(overrides)
                existing.setdefault("_comment",
                                    "Corrections to the built documents, keyed by slug, "
                                    "captured from Foundry by scripts/capture_edits.py. "
                                    "Each needs a 'why' so the next reader can tell a fix "
                                    "from an opinion.")
                with open(path, "w", encoding="utf-8") as handle:
                    json.dump(existing, handle, indent=2, ensure_ascii=False)
                    handle.write("\n")
                print(f"  wrote {os.path.relpath(path, ROOT)}")
    finally:
        if temporary:
            shutil.rmtree(temporary, ignore_errors=True)

    # Folders first: a document written before the folder it sits in would be
    # reported as homeless by the folder that is about to arrive.
    new_documents.sort(key=lambda entry: (entry[0], not is_folder(entry[1])))

    for pack, document in new_documents:
        if args.dry_run:
            print(f"  + {pack}/{document['name']} would be added to the pack source")
            continue
        write_new(pack, document)
        if is_folder(document):
            folders_known.setdefault(pack, set()).add(document["_id"])
    if new_documents and not args.dry_run:
        print(f"  {len(new_documents)} document(s) made in Foundry brought into "
              "the pack source")

    # A pack either groups everything or groups nothing, so a new document
    # left in the compendium root is one check_packs will fail on. Said here,
    # where the fix is a drag in Foundry, rather than at the next deploy.
    for pack, document in new_documents:
        if is_folder(document) or not folders_known.get(pack):
            continue
        if document.get("folder") not in folders_known[pack]:
            print(f"  ! {pack}/{document['name']} is outside the pack's folders; "
                  "file it in Foundry and capture again")

    for name in missing:
        print(f"  ? {name} is in the pack source but not in Foundry "
              "(nothing deleted; say so yourself if it should go)")

    print(f"\n{captured} edited document(s) captured"
          + (" (dry run, nothing written)" if args.dry_run else ""))
    if captured and not args.dry_run:
        print("The pack source now carries the edit. Fill in each 'why' so the "
              "checks can tell it from a regression.")
    if args.exit_code and (captured or new_documents):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

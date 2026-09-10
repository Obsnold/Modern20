#!/usr/bin/env python3
"""Capture edits made in Foundry back into data/overrides/packs/.

The compendia belong to the system, so anything corrected on a sheet in
Foundry is thrown away by the next `deploy.sh --packs`, which recompiles all
fourteen packs from src/packs. This reads the live packs back off the host,
compares them with what the build produces, and writes the differences into
the override layer, where they survive every rebuild.

    scripts/capture_edits.py                     # pull from the Foundry host
    scripts/capture_edits.py --from /tmp/src     # compare an unpacked copy
    scripts/capture_edits.py --dry-run           # say what changed, write nothing

Only fields the build actually sets are compared. Foundry fills in every
default a document does not carry - a prototype token, empty effects, the
whole light configuration - and none of that is an edit. HTML is compared
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

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = os.path.join(ROOT, "src", "packs")
OVERRIDES = os.path.join(ROOT, "data", "overrides", "packs")

DEFAULT_HOST = "user@host"
REMOTE_PACKS = "/var/lib/foundryvtt/Data/systems/modern20/packs"
REMOTE_CLI = "$HOME/fvtt-cli/node_modules/.bin/fvtt"
NODE_BIN = "/opt/node/current/bin"

# Bookkeeping Foundry owns, which differs every time and means nothing here.
SKIP = {"_id", "_key", "_slug", "_stats", "ownership", "sort", "folder"}


def pull(host: str, destination: str) -> None:
    """Unpack the live compendia on the host and bring the JSON back.

    Foundry holds the LevelDB open, so the packs are copied before they are
    read. Everything happens under /tmp on the host and is cleared afterwards.
    """
    script = f"""set -e
export PATH={NODE_BIN}:$PATH
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
        if key in SKIP or key in ("items", "pages"):
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

    for collection in ("items", "pages"):
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


def built_documents(pack: str) -> dict[str, dict]:
    directory = os.path.join(PACKS, pack)
    if not os.path.isdir(directory):
        return {}
    out = {}
    for name in os.listdir(directory):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(directory, name), encoding="utf-8") as handle:
            document = json.load(handle)
        if not document.get("_key", "").startswith("!folders!"):
            out[document["name"]] = document
    return out


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "unnamed"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("host", nargs="?", default=DEFAULT_HOST)
    parser.add_argument("--from", dest="source", help="an already-unpacked copy")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    temporary = None
    source = args.source
    if not source:
        temporary = tempfile.mkdtemp(prefix="modern20-capture-")
        source = temporary
        print(f"Reading the live compendia from {args.host}")
        pull(args.host, source)

    captured = 0
    try:
        for pack in sorted(os.listdir(source)):
            directory = os.path.join(source, pack)
            if not os.path.isdir(directory):
                continue
            built = built_documents(pack)
            overrides = {}

            for name in sorted(os.listdir(directory)):
                if not name.endswith(".json"):
                    continue
                with open(os.path.join(directory, name), encoding="utf-8") as handle:
                    live = json.load(handle)
                if live.get("_key", "").startswith("!folders!"):
                    continue

                was = built.get(live.get("name"))
                if not was:
                    print(f"  ? {pack}/{live.get('name')} is in Foundry and not in the build")
                    continue

                override = differences(was, live)
                if override:
                    overrides[slugify(live["name"])] = {
                        "why": "TODO: say why this differs from the SRD",
                        **override,
                    }
                    captured += 1
                    for field in override:
                        print(f"  + {pack}/{live['name']}: {field}")

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

    print(f"\n{captured} edited document(s) captured"
          + (" (dry run, nothing written)" if args.dry_run else ""))
    if captured and not args.dry_run:
        print("Fill in each 'why', then run build_packs.py to fold them in.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

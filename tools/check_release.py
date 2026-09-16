#!/usr/bin/env python3
"""Fail if a release would not carry what the system needs.

    python3 tools/check_release.py

Every other check in here reads the repository. This one reads the step that
decides what actually reaches a Foundry — the release workflow — which is the
only place a file can be correct, committed, checked, and absent from the
running game.

It replaced a check on a deploy script that scp'd the working tree to one host,
and every bug it exists for came from that script. They were all the same bug
in different clothes: a list of what to copy, kept by hand, that fell behind
what the system reads.

  - the copy step named `module templates lang css` and not `assets`, so the
    artwork the packs point at was never uploaded. Nothing failed; the browser
    asked for 5,271 images one at a time and drew an empty frame for each.
  - the packs to compile were written out, and when the tables pack was added
    nobody added it. Random Tables was an empty compendium for as long as it
    existed, while every check read all 26 tables out of src/packs.
  - nothing read back what was sent, so a deploy that copied nothing looked
    exactly like one that copied everything.

So this holds the release to the repository it is releasing: every directory
the system reads at runtime has to reach the zip, every compendium the manifest
declares has to have source to compile from and a folder to sit in, and the tag
has to be held to the version — a release whose manifest and tag disagree
installs and then never offers an update.

A release missing `assets/` installs perfectly and draws no artwork, which is
the quietest way to ship nothing at all.
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

RELEASE = os.path.join(srd.ROOT, ".github", "workflows", "release.yml")
MANIFEST = os.path.join(srd.ROOT, "system.json")



# Any path into the system's own directory, written anywhere in the code or
# the templates: "systems/modern20/assets/icons/lorc/aura.svg".
SERVED = re.compile(r"systems/modern20/([\w-]+)/")


def manifest() -> dict:
    with open(MANIFEST, encoding="utf-8") as handle:
        return json.load(handle)


def needed() -> dict[str, str]:
    """Every top-level directory the running system reads a file from.

    Taken from the manifest's own entry points and from every path the code
    and templates spell out, rather than from a list kept here — the whole
    failure being a list that was kept somewhere and not updated.
    """
    system = manifest()
    wanted: dict[str, str] = {}

    def want(path: str, why: str) -> None:
        head = str(path).strip("/").split("/")[0]
        if head and not head.endswith(".json") and head != "packs":
            wanted.setdefault(head, why)

    for field in ("esmodules", "styles"):
        for path in system.get(field) or []:
            want(path, f'system.json "{field}"')
    for language in system.get("languages") or []:
        want(language.get("path", ""), 'system.json "languages"')
    for media in system.get("media") or []:
        for key in ("url", "thumbnail"):
            if media.get(key, "").startswith(("module", "assets", "css", "templates")):
                want(media[key], 'system.json "media"')

    sources = glob.glob(os.path.join(srd.ROOT, "module", "**", "*.mjs"), recursive=True)
    sources += glob.glob(os.path.join(srd.ROOT, "templates", "**", "*.hbs"), recursive=True)
    for path in sources:
        with open(path, encoding="utf-8") as handle:
            for directory in set(SERVED.findall(handle.read())):
                want(directory, os.path.relpath(path, srd.ROOT))

    # The packs themselves name their artwork, and they are data rather than
    # code, so their paths are read the same way.
    for path in glob.glob(os.path.join(srd.ROOT, "src", "packs", "*", "*.json")):
        with open(path, encoding="utf-8") as handle:
            for directory in set(SERVED.findall(handle.read())):
                want(directory, "src/packs")

    return wanted


def main() -> int:
    problems: list[str] = []
    wanted = needed()

    # The zip has to carry every directory the system reads. This is the one
    # nobody here will notice is short: a release missing assets/ installs
    # perfectly and draws no artwork.
    if not os.path.exists(RELEASE):
        problems.append(".github/workflows/release.yml is missing; a system is "
                        "distributed as a release, not as a repository")
    else:
        with open(RELEASE, encoding="utf-8") as handle:
            release = handle.read()
        # A directory reaches the zip either by being named in the workflow or
        # by being the head of a path the manifest states.
        system = manifest()
        from_manifest = set()
        for field in ("esmodules", "styles"):
            for path in system.get(field) or []:
                from_manifest.add(str(path).strip("/").split("/")[0])
        for field in ("languages", "packs"):
            for entry in system.get(field) or []:
                from_manifest.add(str(entry.get("path", "")).strip("/").split("/")[0])

        for directory in sorted(wanted):
            if directory in from_manifest:
                continue
            if re.search(rf'"{re.escape(directory)}"', release):
                continue
            problems.append(f"the release zip would not carry {directory}/, which "
                            f"{wanted[directory]} reads from: name it in "
                            "release.yml or state it in the manifest")

        # The tag has to be held to the version, or a release installs and then
        # never updates.
        if "release-$VERSION" not in release:
            problems.append("release.yml does not hold the tag to the version in "
                            "system.json")

        # Whatever runs in the release job runs with `contents: write` — it
        # can create releases and push to the repository. An action from
        # actions/* is GitHub's own; anything else is a third party's code,
        # pinned by a tag they control and free to change under it. Publishing
        # is done with the `gh` CLI, which is already on the runner, so there
        # is nothing here to trust.
        for used in re.findall(r"uses:\s*(\S+)", release):
            if not used.startswith("actions/"):
                problems.append(f"release.yml uses {used}, which is not one of "
                                "GitHub's own actions, in a job that can write "
                                "to this repository")

    # The URLs a release is served from are written at release time from the
    # repository it runs in. A committed guess at them is a URL that points at
    # a repository that may not exist — this manifest said YOURNAME for weeks.
    for field in ("url", "manifest", "download", "bugs"):
        value = manifest().get(field)
        if value and re.search(r"YOURNAME|OWNER|example\.com|<|>", str(value)):
            problems.append(f'system.json "{field}" is {value!r}, which names no '
                            "real repository; leave it out and let the release "
                            "write it")

    # Every compendium the manifest declares has to have source to compile
    # from, and the release compiles the list the manifest gives rather than
    # one written out: that list was written out once, and when the tables pack
    # was added nobody added it to it.
    declared = [pack["name"] for pack in manifest().get("packs") or []]
    for pack in declared:
        if not os.path.isdir(os.path.join(srd.ROOT, "src", "packs", pack)):
            problems.append(f'system.json declares the "{pack}" pack and '
                            f"src/packs/{pack} does not exist")

    # Seventeen compendia in a flat sidebar list is a scrollbar, so the
    # manifest groups them. A pack added later and not added to a folder does
    # not fail anything: it sits at the root, on its own, below the folders —
    # which reads as an oversight because it is one.
    folders = manifest().get("packFolders") or []
    if not folders:
        problems.append("system.json has no packFolders; 17 compendia in one "
                        "flat list is what they are for")
    grouped: dict[str, int] = {}

    def walk(folder: dict, where: str) -> None:
        name = folder.get("name")
        if not name:
            problems.append(f"{where}: a pack folder with no name")
        if folder.get("sorting") not in ("m", "a"):
            problems.append(f'{where} "{name}": sorting is '
                            f'{folder.get("sorting")!r}, not "m" or "a"')
        colour = folder.get("color")
        if colour is not None and not re.fullmatch(r"#[0-9a-fA-F]{6}", str(colour)):
            problems.append(f'{where} "{name}": color {colour!r} is not a hex colour')
        for pack in folder.get("packs") or []:
            grouped[pack] = grouped.get(pack, 0) + 1
        for child in folder.get("folders") or []:
            walk(child, f'{where} "{name}" >')

    for folder in folders:
        walk(folder, "packFolders")

    for pack in declared:
        if pack not in grouped:
            problems.append(f'the "{pack}" compendium is in no pack folder, so it '
                            "sits on its own at the root of the sidebar")
        elif grouped[pack] > 1:
            problems.append(f'the "{pack}" compendium is in {grouped[pack]} pack '
                            "folders")
    for pack in sorted(set(grouped) - set(declared)):
        problems.append(f'a pack folder holds "{pack}", which system.json does '
                        "not declare")

    print(f"the release carries {len(wanted)} directories the system reads and "
          f"compiles {len(declared)} packs into {len(folders)} sidebar folders")
    for problem in problems:
        print(f"FAIL  {problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())

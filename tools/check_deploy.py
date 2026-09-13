#!/usr/bin/env python3
"""Fail if the deploy would not send something the system needs.

    python3 tools/check_deploy.py

Every other check in here reads the repository. This one reads the step that
decides what actually reaches Foundry, which is the only place a file can be
correct, committed, checked — and absent from the running game.

The bugs it exists for were all found by a person running a deploy or opening
a compendium, never by a check:

  - `tools/deploy.sh` copied `module templates lang css` and not `assets`,
    so the artwork the packs point at was never uploaded. Nothing fails; the
    browser asks for 5,271 images one at a time and draws an empty frame for
    each.
  - the packs to compile were written out by hand, and when the tables pack
    was added nobody added it to that list. Random Tables was an empty
    compendium on the live host for as long as it existed. `check_packs.py`
    read all 26 tables from src/packs and said so, cheerfully, the whole time.

  - nothing read back what was sent, so a deploy that copied nothing looked
    exactly like one that copied everything. The symptom is a token that does
    not change, or a fix that appears not to have worked: the token art was
    adjusted three times before anyone asked whether it was being served, and
    a self-test reported the same eleven failures twice running with no way to
    tell a fix that failed from a fix that was not there.
  - and the fix for the second introduced another: `ssh host NAME="a b c" bash`
    joins its arguments into one string for the remote shell, so the
    assignment took "a" and tried to run "b" as a command three quarters of
    the way through a deploy. It reads like a missing program.

So: every directory the system serves files from has to be in the deploy's own
list, the packs it compiles have to be the packs the manifest declares — which
now means the list is read from the manifest rather than repeated — and nothing
is handed to ssh as an environment assignment.
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

DEPLOY = os.path.join(srd.ROOT, "tools", "deploy.sh")
RELEASE = os.path.join(srd.ROOT, ".github", "workflows", "release.yml")
MANIFEST = os.path.join(srd.ROOT, "system.json")

# `SYSTEM_DIRS="module templates lang css assets"`
DIRS = re.compile(r'^SYSTEM_DIRS="([^"]+)"', re.M)

# An environment assignment on the ssh command line: `ssh host NAME="$VALUE"`.
# ssh joins its arguments into one string and hands that to the remote shell,
# so a value with a space in it stops being a value: `PACK_NAMES="a b c"`
# assigned "a" and then tried to run "b" as a command, three quarters of the
# way through a deploy, reading like a missing program.
SSH_ENV = re.compile(r"^ssh\b[^\n]*?\s([A-Z_]+)=", re.M)

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
    with open(DEPLOY, encoding="utf-8") as handle:
        deploy = handle.read()

    problems = []

    found = DIRS.search(deploy)
    if not found:
        print('FAIL  tools/deploy.sh states no SYSTEM_DIRS="..."')
        return 1
    sending = set(found.group(1).split())

    wanted = needed()
    for directory, why in sorted(wanted.items()):
        if directory not in sending:
            problems.append(f"deploy.sh does not send {directory}/, which "
                            f"{why} reads from")
        elif not os.path.isdir(os.path.join(srd.ROOT, directory)):
            problems.append(f"deploy.sh sends {directory}/, which does not exist")

    for directory in sorted(sending - set(wanted)):
        if not os.path.isdir(os.path.join(srd.ROOT, directory)):
            problems.append(f"deploy.sh sends {directory}/, which does not exist")

    # An unquoted heredoc is expanded by the shell that writes it, so anything
    # inside it that looks like a command substitution runs HERE — on the
    # machine doing the deploying, as whoever is deploying. Three prose
    # comments quoting shell in backticks, the way the rest of this repository
    # quotes code, ran `sudo bash -c` locally and stopped the deploy to ask a
    # laptop for a password it has no reason to want.
    heredoc = re.search(r"<<REMOTE\n(.*?)\nREMOTE\n", deploy, re.S)
    if not heredoc:
        problems.append("deploy.sh has no remote script to check")
    else:
        for number, line in enumerate(heredoc.group(1).split("\n"), 1):
            if "`" in line:
                problems.append(f"deploy.sh remote script line {number} has a "
                                f"backtick, which runs on the deploying machine: "
                                f"{line.strip()[:60]}")
            if re.search(r"(?<!\\)\$\(", line):
                problems.append(f"deploy.sh remote script line {number} has an "
                                f"unescaped $( ), which runs on the deploying "
                                f"machine: {line.strip()[:60]}")

    # Anything the remote script needs is written into the script, where this
    # heredoc's own quoting survives.
    for name in SSH_ENV.findall(deploy):
        problems.append(f"deploy.sh passes {name}= to ssh on the command line, "
                        "where a value containing a space becomes a command; "
                        "assign it inside the remote script instead")

    # There are two ways this system reaches a Foundry: scp to one host, and a
    # release anybody can install from. Both have to carry every directory it
    # reads at runtime, and the release is the one nobody here will notice is
    # short — a zip missing assets/ installs perfectly and draws no artwork.
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

    # The URLs a release is served from are written at release time from the
    # repository it runs in. A committed guess at them is a URL that points at
    # a repository that may not exist — this manifest said YOURNAME for weeks.
    for field in ("url", "manifest", "download", "bugs"):
        value = manifest().get(field)
        if value and re.search(r"YOURNAME|OWNER|example\.com|<|>", str(value)):
            problems.append(f'system.json "{field}" is {value!r}, which names no '
                            "real repository; leave it out and let the release "
                            "write it")

    # And it has to read the artwork back. A deploy that copies nothing looks
    # exactly like one that copies everything, and the symptom is a token that
    # does not change — which is indistinguishable from art that is wrong, and
    # cost three rounds of changing art nobody was being served.
    if not (re.search(r"^SENT_SUM=", deploy, re.M)
            and re.search(r'"\\?\$LIVE_SUM"\s*!=\s*"\\?\$SENT_SUM"', deploy)):
        problems.append("deploy.sh does not compare what it sent with what is on "
                        "the host; a deploy that copies nothing has to be "
                        "distinguishable from one that copies everything")
    # And over everything it sends, not the artwork alone: the code is the half
    # whose absence looks like a fix that did not work.
    if re.search(r"^SENT_SUM=.*\bfind assets\b", deploy, re.M):
        problems.append("deploy.sh fingerprints only assets/; the modules and "
                        "templates are the half that looks like a broken fix "
                        "when they do not arrive")

    # The packs are compiled one at a time, and the list has to be the
    # manifest's. A written-out list is the bug, so finding one is a failure
    # even if it happens to be complete today.
    declared = [pack["name"] for pack in manifest().get("packs") or []]
    if "PACK_NAMES" not in deploy:
        problems.append("deploy.sh does not read the pack list from system.json")
    for name in declared:
        if re.search(rf"for p in [^\n]*\b{re.escape(name)}\b", deploy):
            problems.append(f"deploy.sh writes out the pack names ({name} among "
                            "them); read them from the manifest instead")
            break

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

    print(f"deploy sends {len(sending)} directories and compiles "
          f"{len(declared)} packs in {len(folders)} sidebar folders; "
          f"{len(wanted)} directories are read from at runtime, and the release "
          "carries all of them")
    for problem in problems:
        print(f"FAIL  {problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())

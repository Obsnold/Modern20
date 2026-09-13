#!/usr/bin/env bash
#
# Build, verify and install the system on the Foundry host.
#
#   scripts/deploy.sh [user@host] [--packs] [--overwrite-live]
#
# The flag may come in either order, or on its own. It used to have to be the
# second argument, so `deploy.sh --packs` set the host to "--packs" and the
# upload failed against a host of that name — which reads, from the terminal,
# exactly like a deploy that ran and did nothing.
#
# Every check must pass before anything is copied. Piping a check into `tail`
# hides its exit code behind the pipe's, which once let a failing check deploy
# anyway — so results are captured, then reported, then acted on.
set -euo pipefail

HOST=""
PACKS=""
OVERWRITE=""
for argument in "$@"; do
  case "$argument" in
    --packs) PACKS="--packs" ;;
    --overwrite-live) OVERWRITE="yes" ;;
    -*) echo "unknown option: $argument" >&2; exit 2 ;;
    *) HOST="$argument" ;;
  esac
done
# Where this deploys to, and what it expects to find there. All of it comes
# from the environment, because all of it is a fact about somebody's own
# machine: a repository that names the host it was deployed to from one
# person's laptop tells everybody else something untrue.
#
#   MODERN20_HOST      user@host of the Foundry server            (required)
#   MODERN20_DEST      where the system is installed on that host
#   MODERN20_NODE_BIN  a directory to put on PATH there, if node is not on it
#   MODERN20_FVTT      the Foundry CLI on that host
#
# The defaults are conventions rather than anybody's setup: a packaged Foundry
# on Linux keeps its data in /var/lib/foundryvtt, and `fvtt` on PATH is what
# `npm install -g @foundryvtt/foundryvtt-cli` gives you.
HOST="${HOST:-${MODERN20_HOST:-}}"
DEST="${MODERN20_DEST:-/var/lib/foundryvtt/Data/systems/modern20}"
STAGE=/tmp/modern20-deploy
NODE_BIN="${MODERN20_NODE_BIN:-}"
FVTT="${MODERN20_FVTT:-fvtt}"

if [ -z "$HOST" ]; then
  cat >&2 <<'MESSAGE'
No host to deploy to. Either pass one:

    scripts/deploy.sh user@host --packs

or set it once, in your shell or in a file this repository does not track:

    export MODERN20_HOST=user@host
    export MODERN20_DEST=/var/lib/foundryvtt/Data/systems/modern20   # if it differs
    export MODERN20_FVTT=/path/to/fvtt                               # if not on PATH
MESSAGE
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Which compendia to pack, read from the manifest rather than listed here. The
# list used to be written out, and when the tables pack was added nobody
# added it: Random Tables was an empty compendium on the live host for as long
# as it existed, with every check passing, because a check reads src/packs and
# this is the only step that decides what reaches Foundry.
PACK_NAMES="$(python3 -c 'import json; print(" ".join(p["name"] for p in json.load(open("system.json"))["packs"]))')"

# Every directory the system serves files from. assets/ was missing, which is
# quieter than it sounds: the code and the compendia arrive, and 5,271 images
# then 404 one at a time into a page nobody is reading.
SYSTEM_DIRS="module templates lang css assets"

# What is being sent, as one number over every file in path order, so the
# deploy can say whether the files Foundry will load are the files in this
# repository. It covered assets only at first, which answered "did the artwork
# arrive" and left "did the code arrive" to be inferred from whether a fix
# appeared to work — and two rounds of a self-test reporting the same eleven
# failures could not distinguish a fix that did not work from a fix that was
# not there.
SENT_SUM="$(find $SYSTEM_DIRS -type f | LC_ALL=C sort | xargs md5sum | awk '{print $1}' | md5sum | cut -d' ' -f1)"
SENT_COUNT="$(find $SYSTEM_DIRS -type f | wc -l | tr -d ' ')"

echo "==> Local checks"
# All of them. This list was written out too, and had fallen three checks
# behind the ones CI runs.
python3 scripts/check_private.py
python3 scripts/check_globals.py
python3 scripts/check_app_props.py
python3 scripts/check_lang.py
python3 scripts/check_config.py
python3 scripts/check_shadowing.py
python3 scripts/check_packs.py
python3 scripts/check_coverage.py
python3 scripts/check_rules_links.py
python3 scripts/check_capture.py
python3 scripts/check_art.py
python3 scripts/check_deploy.py
python3 scripts/check_selftest.py
python3 scripts/gen_pregens.py --check
python3 scripts/gen_guide.py --check
python3 scripts/gen_cover.py --check
python3 scripts/gen_scene.py --check

# Packing rewrites the compendia from src/packs, so anything edited on a sheet
# and not yet captured is gone. Foundry is where this system's content is
# edited now, which makes that the easiest way to lose an afternoon's work, so
# --packs looks first.
if [ -n "$PACKS" ] && [ -z "$OVERWRITE" ]; then
  echo "==> Looking for edits made in Foundry"
  if ! python3 scripts/capture_edits.py "$HOST" --dry-run --exit-code; then
    cat >&2 <<'MESSAGE'

The live compendia hold something src/packs does not. Packing would overwrite
it. Bring it home first:

    python3 scripts/capture_edits.py       # then read the diff and commit

or, if the live packs really are the ones to throw away:

    scripts/deploy.sh --packs --overwrite-live
MESSAGE
    exit 1
  fi
fi

echo "==> Packaging"
TARBALL="$(mktemp -d)/modern20.tgz"
tar czf "$TARBALL" \
  --exclude='./.git' --exclude='./.cache' --exclude='./packs' \
  --exclude='__pycache__' --exclude='./node_modules' .

echo "==> Uploading to $HOST"
scp -q -o BatchMode=yes "$TARBALL" "$HOST:/tmp/modern20.tgz"

echo "==> Remote checks and install"
# Everything below is inside an unquoted heredoc, which bash expands HERE
# before sending it. So a backtick in it is a command substitution that runs on
# this machine, and a $( ) that is not escaped is too. Three prose comments
# quoting `sudo bash -c` and `$DEST/$SYSTEM_DIRS` the way the rest of this
# repository quotes code turned into local commands, and the deploy stopped to
# ask for a sudo password on the wrong host entirely. check_deploy.py fails on
# either now; keep prose above this line, where prose is prose.
#
# Nothing is passed as an environment assignment on the ssh command line: ssh
# joins its arguments into one string for the remote shell, so a value with a
# space in it is read as a command. `PACK_NAMES="classes occupations ..."`
# became an assignment of "classes" followed by an attempt to run
# "occupations", which is a failure in the middle of a deploy that reads like a
# missing program. The values are written into the script instead, where this
# heredoc expands them locally and the quotes survive.
ssh -o BatchMode=yes "$HOST" bash -euo pipefail -s <<REMOTE
export PATH="${NODE_BIN:+$NODE_BIN:}\$PATH"
PACKS="$PACKS"
PACK_NAMES="$PACK_NAMES"
SENT_SUM="$SENT_SUM"
SENT_COUNT="$SENT_COUNT"
SYSTEM_DIRS="$SYSTEM_DIRS"
rm -rf $STAGE && mkdir -p $STAGE
tar xzf /tmp/modern20.tgz -C $STAGE
cd $STAGE

# Not piped: a failure here must stop the deploy.
node scripts/check_models.mjs
node scripts/check_templates.mjs
node scripts/check_casting.mjs
node scripts/check_combat.mjs
node scripts/check_creatures.mjs
node scripts/check_objects.mjs
node scripts/check_rules.mjs

if [ "\$PACKS" = "--packs" ]; then
  for p in \$PACK_NAMES; do
    $FVTT package pack -n \$p --in src/packs/\$p --out packs >/dev/null
    echo "  packed \$p"
  done
  sudo -n rm -rf $DEST/packs
  sudo -n cp -r packs $DEST/packs
fi

sudo -n cp system.json $DEST/system.json
for dir in \$SYSTEM_DIRS; do
  sudo -n mkdir -p $DEST/\$dir
  sudo -n cp -r \$dir/. $DEST/\$dir/
done
sudo -n chown -R foundry:foundry $DEST

# Everything that was sent, read back from where Foundry loads it. A deploy
# that copies nothing looks exactly like a deploy that copies everything, and
# the symptom is a fix that appears not to have worked.
# The directory list is interpolated rather than passed; see the note above the
# ssh call.
# A host that will not let this read back what it just wrote says so and the
# deploy carries on: the files are installed either way, and a check that
# cannot run is not a reason to fail a deploy that worked. A read that does
# run and disagrees is a different thing, and stops it.
if LIVE_LIST="\$(sudo -n bash -c 'cd $DEST && find $SYSTEM_DIRS -type f | LC_ALL=C sort | xargs md5sum' 2>/dev/null)"; then
  LIVE_COUNT="\$(echo "\$LIVE_LIST" | wc -l | tr -d ' ')"
  LIVE_SUM="\$(echo "\$LIVE_LIST" | awk '{print \$1}' | md5sum | cut -d' ' -f1)"
  if [ "\$LIVE_SUM" != "\$SENT_SUM" ]; then
    echo "  what is on this host is not what was sent:" >&2
    echo "    sent \$SENT_COUNT files, \$SENT_SUM" >&2
    echo "    live \$LIVE_COUNT files, \$LIVE_SUM" >&2
    exit 1
  fi
  echo "  installed and verified: \$LIVE_COUNT files, \$LIVE_SUM"
else
  echo "  installed \$SENT_COUNT files, \$SENT_SUM"
  echo "  (could not read them back to check: sudo declined without a password)"
fi
# Read with sudo: the files were just chowned to foundry, and the deploying
# user cannot read them any more.
echo "  version live: \$(sudo -n grep -m1 '\"version\"' $DEST/system.json 2>/dev/null | tr -d ' ,' || echo "unreadable")"
sudo -n systemctl restart foundry
sleep 8
systemctl is-active foundry
sudo -n journalctl -u foundry --since "-1 min" --no-pager | grep -iE " error" || echo "no errors in log"
REMOTE

echo "==> Done"

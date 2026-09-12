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
HOST="${HOST:-user@host}"
DEST=/var/lib/foundryvtt/Data/systems/modern20
STAGE=/tmp/modern20-deploy
NODE_BIN=/opt/node/current/bin
FVTT="\$HOME/fvtt-cli/node_modules/.bin/fvtt"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Which compendia to pack, read from the manifest rather than listed here. The
# list used to be written out, and when the tables pack was added nobody
# added it: Random Tables was an empty compendium on the live host for as long
# as it existed, with every check passing, because a check reads src/packs and
# this is the only step that decides what reaches Foundry.
PACK_NAMES="$(python3 -c 'import json; print(" ".join(p["name"] for p in json.load(open("system.json"))["packs"]))')"

# What the artwork should be, as one number over every file in path order, so
# the deploy can say whether the files a browser will fetch are the files in
# this repository. Three rounds of changing the token art went out with no way
# to tell whether any of it had arrived — the art was adjusted, redeployed and
# looked at, and "still wrong" could have meant the art or the delivery.
ASSET_SUM="$(find assets -type f | LC_ALL=C sort | xargs md5sum | awk '{print $1}' | md5sum | cut -d' ' -f1)"
ASSET_COUNT="$(find assets -type f | wc -l | tr -d ' ')"

# Every directory the system serves files from. assets/ was missing, which is
# quieter than it sounds: the code and the compendia arrive, and 5,271 images
# then 404 one at a time into a page nobody is reading.
SYSTEM_DIRS="module templates lang css assets"

echo "==> Local checks"
# All of them. This list was written out too, and had fallen three checks
# behind the ones CI runs.
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
# Nothing is passed as an environment assignment on the ssh command line: ssh
# joins its arguments into one string for the remote shell, so a value with a
# space in it is read as a command. `PACK_NAMES="classes occupations ..."`
# became an assignment of "classes" followed by an attempt to run
# "occupations", which is a failure in the middle of a deploy that reads like a
# missing program. The values are written into the script instead, where this
# heredoc expands them locally and the quotes survive.
ssh -o BatchMode=yes "$HOST" bash -euo pipefail -s <<REMOTE
export PATH=$NODE_BIN:\$PATH
PACKS="$PACKS"
PACK_NAMES="$PACK_NAMES"
SYSTEM_DIRS="$SYSTEM_DIRS"
ASSET_SUM="$ASSET_SUM"
ASSET_COUNT="$ASSET_COUNT"
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

# The artwork, read back from where Foundry serves it. A deploy that copies
# nothing looks exactly like a deploy that copies everything, and the symptom
# is a token that does not change.
LIVE_COUNT="\$(sudo -n find $DEST/assets -type f | wc -l | tr -d ' ')"
LIVE_SUM="\$(sudo -n bash -c 'cd $DEST && find assets -type f | LC_ALL=C sort | xargs md5sum' | awk '{print \$1}' | md5sum | cut -d' ' -f1)"
if [ "\$LIVE_SUM" != "\$ASSET_SUM" ]; then
  echo "  the artwork on this host is not the artwork that was sent:" >&2
  echo "    sent \$ASSET_COUNT files, \$ASSET_SUM" >&2
  echo "    live \$LIVE_COUNT files, \$LIVE_SUM" >&2
  exit 1
fi
echo "  artwork verified: \$LIVE_COUNT files, \$LIVE_SUM"
echo "  version live: \$(grep -m1 '\"version\"' $DEST/system.json | tr -d ' ,')"
sudo -n systemctl restart foundry
sleep 8
systemctl is-active foundry
sudo -n journalctl -u foundry --since "-1 min" --no-pager | grep -iE " error" || echo "no errors in log"
REMOTE

echo "==> Done"

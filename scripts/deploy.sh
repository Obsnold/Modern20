#!/usr/bin/env bash
#
# Build, verify and install the system on the Foundry host.
#
#   scripts/deploy.sh [user@host] [--packs]
#
# Every check must pass before anything is copied. Piping a check into `tail`
# hides its exit code behind the pipe's, which once let a failing check deploy
# anyway — so results are captured, then reported, then acted on.
set -euo pipefail

HOST="${1:-user@host}"
PACKS="${2:-}"
DEST=/var/lib/foundryvtt/Data/systems/modern20
STAGE=/tmp/modern20-deploy
NODE_BIN=/opt/node/current/bin
FVTT="\$HOME/fvtt-cli/node_modules/.bin/fvtt"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Local checks"
python3 scripts/check_globals.py
python3 scripts/check_app_props.py
python3 scripts/check_lang.py
python3 scripts/check_config.py
python3 scripts/check_shadowing.py

echo "==> Packaging"
TARBALL="$(mktemp -d)/modern20.tgz"
tar czf "$TARBALL" \
  --exclude='./.git' --exclude='./.cache' --exclude='./packs' \
  --exclude='__pycache__' --exclude='./node_modules' .

echo "==> Uploading to $HOST"
scp -q -o BatchMode=yes "$TARBALL" "$HOST:/tmp/modern20.tgz"

echo "==> Remote checks and install"
ssh -o BatchMode=yes "$HOST" PACKS="$PACKS" bash -euo pipefail -s <<REMOTE
export PATH=$NODE_BIN:\$PATH
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
  for p in classes occupations talents feats spells psionics weapons armor gear creatures vehicles objects rules; do
    $FVTT package pack -n \$p --in src/packs/\$p --out packs >/dev/null
    echo "  packed \$p"
  done
  sudo -n rm -rf $DEST/packs
  sudo -n cp -r packs $DEST/packs
fi

sudo -n cp system.json $DEST/system.json
for dir in module templates lang css; do
  sudo -n cp -r \$dir/. $DEST/\$dir/
done
sudo -n chown -R foundry:foundry $DEST
sudo -n systemctl restart foundry
sleep 8
systemctl is-active foundry
sudo -n journalctl -u foundry --since "-1 min" --no-pager | grep -iE " error" || echo "no errors in log"
REMOTE

echo "==> Done"

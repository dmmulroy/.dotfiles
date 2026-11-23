#!/bin/sh
# End-to-end test of transfer_pi_session against a real Rex host.
#
#   tests/e2e.sh <rex host label>        e.g. tests/e2e.sh exe-dev-box
#
# Run it from a Rex terminal on the source machine. It makes a throwaway git
# repository with staged, unstaged, deleted, untracked and ignored files, starts
# pi in it (one small model request), transfers the session, and checks that the
# target's working tree matches. It removes everything it created on both sides,
# including the Rex session on the target if the test created it.
set -eu

host="${1:?usage: e2e.sh <rex host label>}"
here=$(cd "$(dirname "$0")" && pwd)
worker="$here/../run.lua"
work="$HOME/pi-transfer-e2e"
repo="$work/app"
sidecars="${XDG_STATE_HOME:-$HOME/.local/state}/pi-rex/blocks"
dest=$(rex hosts --json | jq -r --arg h "$host" \
  '.hosts[].host | select(.label == $h) | .endpoints[] | select(startswith("ssh://"))' |
  head -1 | sed -e 's|^ssh://||' -e 's|/.*$||')
[ -n "$dest" ] || { echo "host $host has no ssh:// endpoint" >&2; exit 2; }
# The target's login shell may not be sh (fish on exe.dev), so always name it.
remote() { ssh -o BatchMode=yes "$dest" sh -s; }

block=""
sessions_before=$(rex -S "$host" ls --json | jq -r '.sessions[].session_id' | sort)

cleanup() {
  [ -n "$block" ] && rex block close "$block" >/dev/null 2>&1 || true
  for s in $(rex -S "$host" ls --json | jq -r '.sessions[].session_id' | sort); do
    echo "$sessions_before" | grep -qx "$s" || rex -S "$host" kill "$s" >/dev/null 2>&1 || true
  done
  remote <<'EOF' || true
rm -rf "$HOME/pi-transfer-e2e" "$HOME"/.pi/agent/sessions/--*-pi-transfer-e2e-*
EOF
  rm -rf "$work" "$HOME"/.pi/agent/sessions/--*-pi-transfer-e2e-*
}
trap cleanup EXIT

rm -rf "$work"
mkdir -p "$repo/pkg"
cd "$repo"
git init -q -b main
printf 'one\n' > a.txt
printf 'gone\n' > deleted.txt
printf 'x\n' > pkg/p.txt
printf 'ignored.log\n' > .gitignore
git add -A
git -c commit.gpgsign=false -c user.name=e2e -c user.email=e2e@localhost commit -qm init
printf 'two\n' >> a.txt
rm deleted.txt
printf 'new\n' > pkg/untracked.txt
printf 'nope\n' > ignored.log
git add pkg/untracked.txt
index_before=$(git diff --cached --stat)

block=$(rex run --json --focus=false --label pi-transfer-e2e --cwd "$repo/pkg" -- \
  pi "Reply with exactly one word: ready" | jq -r '.block_ids[0]')
sidecar="$sidecars/${block#block:}.json"
tries=0
until [ -f "$sidecar" ] && [ -f "$(jq -r '.session_file // ""' "$sidecar")" ]; do
  tries=$((tries + 1))
  [ "$tries" -le 60 ] || { echo "pi didn't save a session within 60s" >&2; exit 1; }
  sleep 1
done

rex do "$worker" block_id="$block" host="$host"

fail() { echo "FAIL: $1" >&2; exit 1; }

# Target: same commit and branch, same changes (all unstaged), no ignored file.
# git prints a staged add as "A " and an untracked file as "??"; the transfer
# doesn't keep staging, so compare paths only.
expected=$(git status --short | sed 's/^...//' | sort)
actual=$(remote <<'EOF'
cd "$HOME/pi-transfer-e2e/app"
git status --short | sed 's/^...//' | sort
echo "head=$(git rev-parse HEAD) branch=$(git symbolic-ref --short HEAD)"
echo "a=$(tr '\n' ',' < a.txt) ignored=$([ -e ignored.log ] && echo yes || echo no)"
echo "refs=$(git for-each-ref refs/pi-transfer | wc -l | tr -d ' ')"
EOF
)
want="$expected
head=$(git rev-parse HEAD) branch=main
a=one,two, ignored=no
refs=0"
[ "$actual" = "$want" ] || fail "target working tree differs:
--- want
$want
--- got
$actual"

# Source: untouched apart from its pane being closed.
[ "$(git diff --cached --stat)" = "$index_before" ] || fail "the source index changed"
[ -z "$(git for-each-ref refs/pi-transfer)" ] || fail "a snapshot ref was left on the source"
rex block ls --json | grep -q "$block" && fail "the source pane is still open"
block=""

echo "PASS"

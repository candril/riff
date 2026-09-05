#!/usr/bin/env bash
# Take the documentation screenshots from the fixture PR, unattended.
#
#   scripts/shots.sh [name ...]         # all shots in docs/shots.txt, or just the named ones
#
# Each line of docs/shots.txt is `name | keys`, where keys are tmux send-keys tokens
# (Enter, Escape, Space, C-p, or a literal string) sent one at a time; `wait` pauses
# for a background load and `type:"text"` types literal text. Every shot starts from
# a fresh launch of riff on the fixture PR in a detached tmux pane, so the sequence in
# the file is the whole recipe — the same keys you would press by hand. The pane is
# captured with its colours and rendered to a PNG.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=scripts/fixture.sh
source scripts/fixture.sh

COLS=${SHOT_COLS:-140}
ROWS=${SHOT_ROWS:-42}
OUT=${SHOT_DIR:-site/src/assets/screenshots}
SESSION=riff-shots
SCRATCH=${TMPDIR:-/tmp}/riff-shots

mkdir -p "$OUT" "$SCRATCH"
fixture

shoot() {
  local name=$1; shift
  launch "$SESSION" "$COLS" "$ROWS"
  send "$SESSION" "$*"
  sleep 1
  capture "$SESSION" "$SCRATCH/$name.txt"
  python3 scripts/render-shot.py "$SCRATCH/$name.txt" "$OUT/$name.png" --cols "$COLS" --rows "$ROWS"
}

# `xargs` would eat the quotes around type:"…" text — trim with sed instead.
trim() { printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }

wanted=("$@")
while IFS= read -r line; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  name=$(trim "${line%%|*}")
  keys=$(trim "${line#*|}")
  if [ ${#wanted[@]} -gt 0 ] && [[ ! " ${wanted[*]} " == *" $name "* ]]; then
    continue
  fi
  shoot "$name" "$keys"
done < docs/shots.txt

tmux kill-session -t "$SESSION" 2>/dev/null || true
echo "done → $OUT"

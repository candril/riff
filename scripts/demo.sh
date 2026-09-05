#!/usr/bin/env bash
# Record the README demo gif from the fixture PR, unattended — the same tmux capture
# and Pillow render as scripts/shots.sh, one frame per step of docs/demo.txt.
#
#   scripts/demo.sh                     # → site/src/assets/riff-demo.gif
#
# Each line of docs/demo.txt is `hold | keys | keycap | caption`: the keys are sent, the
# pane is captured after they land, and the frame is shown with the keycap and caption
# drawn on a panel low over it. `hold` is seconds, or `auto` to let the caption's length
# set the dwell. A line with no keys just holds the previous frame longer.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=scripts/fixture.sh
source scripts/fixture.sh

COLS=${DEMO_COLS:-140}
ROWS=${DEMO_ROWS:-42}
OUT=${DEMO_OUT:-site/src/assets/riff-demo.gif}
SESSION=riff-demo-rec
SCRATCH=${TMPDIR:-/tmp}/riff-demo-rec

/bin/rm -rf "$SCRATCH"
mkdir -p "$SCRATCH"

fixture
launch "$SESSION" "$COLS" "$ROWS"

# Captions are prose — apostrophes and quotes rule out the `xargs` trim used elsewhere.
trim() { printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }

manifest="$SCRATCH/frames.tsv"
: > "$manifest"
n=0
while IFS='|' read -r hold keys keycap caption; do
  [[ -z "${hold// /}" || "${hold// /}" == \#* ]] && continue
  hold=$(trim "$hold")
  keys=$(trim "$keys")
  keycap=$(trim "${keycap:-}")
  caption=$(trim "${caption:-}")
  send "$SESSION" "$keys"
  sleep 0.8
  n=$((n + 1))
  frame=$(printf "%s/frame-%03d.txt" "$SCRATCH" "$n")
  capture "$SESSION" "$frame"
  printf '%s\t%s\t%s\t%s\n' "$frame" "$hold" "$keycap" "$caption" >> "$manifest"
done < docs/demo.txt

tmux kill-session -t "$SESSION" 2>/dev/null || true
python3 scripts/render-shot.py --gif "$OUT" --frames "$manifest" --cols "$COLS" --rows "$ROWS"

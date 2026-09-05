# Shared by scripts/shots.sh and scripts/demo.sh — not meant to be run directly.
#
# riff has no offline mode, so the docs are recorded against a real PR: the
# fixture is a private repo with one open PR, cloned into scratch and used as
# the working directory. That is what makes riff treat it as "the current
# repo", so review data lands in the clone's .riff/ and never in this checkout.
# Anyone with access to the fixture repo can re-record; point RIFF_FIXTURE_REPO
# and RIFF_FIXTURE_PR at another PR to record against something else.

# Callers cd to the repo root before sourcing this.
RIFF=$(pwd)
FIXTURE_REPO=${RIFF_FIXTURE_REPO:-candril/riff-demo}
FIXTURE_PR=${RIFF_FIXTURE_PR:-1}
FIXTURE_DIR=${RIFF_FIXTURE_DIR:-${TMPDIR:-/tmp}/riff-fixture}

fixture() {
  if [ ! -d "$FIXTURE_DIR/.git" ]; then
    gh repo clone "$FIXTURE_REPO" "$FIXTURE_DIR" -- -q
  fi
}

# launch <session> <cols> <rows>: riff on the fixture PR in a detached tmux pane.
launch() {
  local session=$1 cols=$2 rows=$3
  tmux kill-session -t "$session" 2>/dev/null || true
  # Every launch starts from a PR nobody has reviewed yet — drafts from one
  # screenshot must not show up in the next.
  /bin/rm -rf "$FIXTURE_DIR/.riff"
  tmux new-session -d -s "$session" -x "$cols" -y "$rows" -c "$FIXTURE_DIR" \
    "bun '$RIFF/src/index.ts' $FIXTURE_PR 2>/dev/null; sleep 600"
  # One GraphQL round trip plus the diff, then the first render.
  sleep "${LAUNCH_WAIT:-8}"
}

# send <session> "<keys>": tmux send-keys tokens, whitespace-separated, one at a time.
# `wait` pauses for a background load. `type:"some text"` types the quoted text
# literally (spaces included) into a composer; tokens after the closing quote are
# sent as keys again, so `type:"hello" Enter Escape` types, submits and closes.
send() {
  local session=$1 keys=$2
  while [ -n "$keys" ]; do
    local head=$keys text=""
    if [[ "$keys" == *'type:"'* ]]; then
      head=${keys%%type:\"*}
      text=${keys#*type:\"}
      keys=${text#*\"}
      text=${text%%\"*}
    else
      keys=""
    fi
    local key
    for key in $head; do
      if [ "$key" = "wait" ]; then sleep 2; else tmux send-keys -t "$session" -- "$key"; sleep 0.35; fi
    done
    if [ -n "$text" ]; then
      tmux send-keys -t "$session" -l -- "$text"; sleep 0.4
    fi
  done
}

# capture <session> <file>: the pane with its colours, plus the terminal cursor's cell
# in <file>.cursor — riff moves the real cursor, and capture-pane leaves it out.
capture() {
  local session=$1 file=$2
  tmux capture-pane -t "$session" -e -N -p > "$file"
  if [ "$(tmux display -t "$session" -p '#{cursor_flag}')" = "1" ]; then
    tmux display -t "$session" -p '#{cursor_x} #{cursor_y}' > "$file.cursor"
  else
    /bin/rm -f "$file.cursor"
  fi
}

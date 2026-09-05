# Screenshots and the demo gif

The images on the docs site are recorded, not taken by hand, so they can be
redone after any UI change with one command each:

```sh
just shots            # every screenshot in docs/shots.txt → site/src/assets/screenshots/
just shots help diff  # just those two
just demo-gif         # docs/demo.txt → site/src/assets/riff-demo.gif
```

## The fixture

riff has no offline mode — every screen is backed by a real PR. The recordings
run against `candril/riff-demo#1`, a private repo holding a fictional shop API
and one open PR ("Add rate limiting to the API client") with seeded review
threads: an open question with a reply, two unresolved findings, a resolved
nit, and a PR-level comment. Three commits, six files, ~170 lines of diff —
enough to show hunks, threads, folds and the commit filter, small enough that
one screen tells the story.

`scripts/fixture.sh` clones it into `$TMPDIR/riff-fixture` and runs riff from
inside that clone, so it counts as "the current repo" and all review data lands
in the clone's `.riff/`, wiped before every run. Nothing touches this checkout,
and nothing is submitted: the recipes open the review and sync previews and
`Escape` out of them.

Access to the fixture is what's needed to re-record. Set `RIFF_FIXTURE_REPO`
and `RIFF_FIXTURE_PR` to record against a different PR.

## How it works

Each recipe launches riff in a detached tmux pane at 140×42, sends the keys one
at a time with `tmux send-keys`, and captures the pane with its colours
(`capture-pane -e`). `scripts/render-shot.py` renders that capture with Pillow —
Menlo at 2× on riff's own background — so the result doesn't depend on which
terminal or font is installed. The gif is the same, one frame per step, with the
keycap and caption drawn on a panel over the frame.

Requirements: `tmux`, `python3` with Pillow (`pip install pillow`), `gh`
authenticated with access to the fixture, and Menlo (macOS ships it; change
`FONT` in `render-shot.py` elsewhere).

## Writing a recipe

`docs/shots.txt` is `name | keys`. `docs/demo.txt` is `hold | keys | keycap |
caption`. Keys are tmux tokens: a letter, `Enter`, `Escape`, `C-p`, a chord as
separate letters (`] c`, `g S`), `wait` to pause for a background load, and
`type:"some text"` to type into a composer. Every recipe starts from a fresh launch
on the PR overview, so the keys are the whole story of the screenshot.

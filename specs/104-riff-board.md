# Opening the PR in riff board

**Status**: Done

## Description

riff board is the user's own web app for working through a pull request,
run separately on their machine. `gB` hands the browser the board's page
for the PR in view, at the place being read when there is one, so moving
from the terminal to the board costs one chord.

## Out of Scope

- Starting, probing or talking to the board. riff builds a URL and opens
  it; when the board is down, the browser's connection error says so.
- Local and range reviews. The board is keyed by PR.
- Sharing code or state with the board beyond what the URL carries.

## Capabilities

### P1

- **`gB` opens `<board.url>/pr/<owner>/<repo>/<number>`** for the current
  PR. `board.url` is configuration (`[board] url`, default
  `http://localhost:4477`), since the board is the user's app, not riff's.
  The action menu's "Open in riff board" does the same, and shows only
  where a PR is loaded.
- **Outside PR mode it says so**: a local or range review, or a PR whose
  info has not loaded, gets the notice "riff board opens GitHub PRs only"
  instead of a URL.
- **It works from every view of a PR**, and the URL says where the reader
  is:
  - from the diff, the file and the line under the cursor (a selection's
    first line), as `?file=…&line=…`; a removed line has no new-side
    number, so it is sent by its old-side one with `&side=old`
  - from the file tree, the file alone
  - from the overview and the feed, nothing past the PR's path
  The query is extra: a board that does not read it still lands on the PR.

## Known limit

While a single commit is viewed (`state.viewingCommit`), the line sent is
the line in that commit's diff, while the board opens the whole PR, so it
can name the wrong line once the board reads the query. The PR diff link
shares the resolver and the limit.

## Technical Notes

- `src/features/riff-board/index.ts`: `boardPrUrl`, `boardLocation` and
  `openPrInBoard`; the line comes from the permalink feature's
  `diffTargetAt`, so the board and the PR diff link agree on what is under
  the cursor.
- The chord is matched as `gB!` or `gb!` in `src/app/global-keys.ts`, and
  in the overview's own `g` chords in `src/features/pr-info-panel/input.ts`,
  as terminals differ in how they report shift+b. Both run the
  `open-in-board` action; `src/app.ts` hands it the location.
- `src/actions/registry.ts`: the menu row; `src/config/`: `[board] url`.
- User docs: `site/src/content/docs/reference/github.md`,
  `key-bindings.md` and `configuration.md`.

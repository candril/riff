## Copy GitHub Permalink

**Status**: Done

## Description

Three link shapes, because they answer different questions:

- **Permalink** — the file's contents at a revision. For pointing at code.
- **PR diff link** — the change in the PR's Files-changed view. For pointing
  at something under discussion, with both columns, the hunk, and the review
  comments around it.
- **Comment link** — a specific comment or thread. For "see what X said here".

Copy a GitHub blob URL for what the user is currently aiming at — the
visual-line selection, the line under the cursor, or the whole file — from the
Ctrl+p palette or the `gY` chord. The URL pins to the revision riff is
displaying, so the reader lands on the lines the copier was looking at.

## Out of Scope

- Linking deleted lines to the base version — those fall back to a file link
- Opening the permalink in a browser (that's `go` for the PR itself)
- Making an unpushed local change linkable — nothing on GitHub holds it

## Capabilities

### P1 - MVP

- `Copy Permalink` action whose label names the active scope (selection /
  current line / file), plus a `Copy Permalink (whole file)` action that never
  anchors a line.
- `gY` chord for the scope-aware variant, next to `gy` (copy PR URL).
- PR mode links to the SHA of the diff on screen — the commit being viewed
  when the diff is filtered to one, else the head riff loaded. Fork PRs
  resolve against the fork's repo.
- Local mode links to the current git branch or jj bookmark, falling back to
  the HEAD SHA when the repo has neither, and warns when the file on screen
  differs from that ref.
- `Copy Comment Link` copies a link to the focused comment — `y` in the
  comments panel, or from the palette, where it resolves the thread under the
  diff cursor and then whatever the view last marked as reactable.
- `Copy PR Diff Link` targets the Files-changed view, addressing deletions on
  the left column — which a blob URL cannot express at all — and follows the
  commit filter into the per-commit view (`/pull/N/files/<sha>`).
- GitHub Enterprise hosts work: the origin comes from the PR URL or the
  `origin` remote, never a hardcoded github.com.

## Technical Notes

### Files

```
src/features/permalink/
  url.ts        # buildPermalinkUrl, parseRemoteUrl — pure, no app state
  repo-ref.ts   # owner/repo/ref from PrInfo, or from git/jj for local mode
  handlers.ts   # scope detection, clipboard, toasts
src/utils/clipboard.ts   # shared with the AI-review draft copy and yank
```

### PR diff anchors

GitHub ids each diff row `diff-<sha256 of the file path><L|R><line>`, and the
file heading `diff-<sha256 of the file path>`. Verified against a live PR page
rather than inferred: all 85 changed files' anchors matched `sha256(path)`.

There is no range anchor — the page carries no `R12-R20`-style ids — so a
multi-line selection lands on its first line. The row comes from
`DiffLineMapping.getCommentAnchor`, the same resolution comments use, which is
what gives deletions a left-column anchor — and, per spec 048, means expanded
context falls back to a file-level anchor, since the PR's diff view has no row
for a line outside the hunks.

The link is built against the **base** repo: a fork PR's branch lives on the
fork, but the PR does not.

### Comment anchors

GitHub anchors comments on the PR page as `#discussion_r<id>` (review
comment), `#issuecomment-<id>` (conversation) and `#pullrequestreview-<id>`
(review summary). The API supplies those URLs for most objects and riff uses
them directly; the anchors are reconstructed only as a fallback, which was
checked to be byte-identical to the API's `html_url` for a real comment.

Focus is resolved from `state.reactionTarget` (spec 042) rather than a new
concept — it already tracks the item the view is pointing at, across the
inline overlay and the PR info panel. A comment that hasn't been synced has no
link, and says so instead of copying something broken.

### Line resolution

Line numbers come from `DiffLineMapping` via `newLineNum`, since the link
points at the file as it exists at the ref. Deletion lines carry no
`newLineNum`; a selection keeps the additions/context it covers, and a cursor
sitting on a lone deletion degrades to a file-level link rather than anchoring
a line that shows unrelated content.

### Ref resolution

The first cut pinned to the branch name, on the theory that a branch follows
the work. That was wrong: line numbers belong to a specific revision, so a
branch that has moved — or, locally, that never contained the working copy —
drops the reader on unrelated lines. GitHub's own "copy permalink" swaps the
branch for a SHA for exactly this reason, and riff now does the same wherever
it knows the SHA.

Local mode is the case no ref can fix: the diff usually shows the working
copy, which isn't on GitHub at all. `fileDiffersAtRef` compares the file
against the resolved ref and the toast says so, rather than letting the reader
find out. (With `--target <rev>`, that comparison is against the working copy,
so it can warn when the reviewed revision itself would have matched.)

`PrInfo` gained `headRepoOwner` / `headRepoName` (from `gh pr view --json
headRepository,headRepositoryOwner`) because a fork PR's head branch does not
exist in the base repo, so `blob/<headRef>` there would 404.

Local mode reuses `detectCurrentBranch()` from `providers/current-pr.ts` — git
branch first, nearest jj bookmark otherwise, since colocated jj repos leave
git's HEAD detached.

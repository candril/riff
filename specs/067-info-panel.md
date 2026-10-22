# Info Panel

**Status**: Done

## Description

The PR overview is the first thing riff shows and it spends its rows saying
what the header line already said. On a real PR:

```
 Open  #14391  @dependabot  chore(deps): bump golang.org/x/…  ✓  ↻ 01:17  0/2 reviewed
 chore(deps): bump golang.org/x/sync from 0.22.0 to 0.23.0        ← the title again
 ─────────────────────────────
 Status    Open               ← in the header
 Author    @dependabot[bot]
 Branch    dependabot/… → trunk
 Changes   +3 -3 (2 files)    ← in the Files section
 Reviews   no reviews yet     ← in the header
```

Three of five metadata rows are duplicates, and none of it answers what
changed. This is the state view: what is true about this PR, now, at a
glance, with everything else one keystroke away.

## Out of Scope

- Events. What happened and in what order is the feed (spec 070).
- Local mode. There is no PR to describe.

## Capabilities

### P1

- The metadata block is one row: **Author** and **Branch**. Status, Changes
  and Reviews go, because the header already carries them; the repeated title
  goes.
- Every section is folded on arrival except **Description**, which opens,
  since it is what a reader came to see first; **Merge status**
  ([108](./108-merge-status.md)) stays folded. Each header carries its count and a
  one-glance summary right after it, two cells on; Merge status carries its
  verdict there, folded or not, and folded it names what blocks:

```
  ▶  Merge status  ✗ blocked · lint, e2e failing
  ▼  Description (2)
      …the description…
  ▶  Previews (6)  4 live · 2 on demand  ·  from deploy-bot[bot]
  ▶  Conversation (2)  1 unresolved
  ▶  Files (12)  +487 -53
  ▶  Commits (5)  last 17m
```

- The sections the reader opens are theirs for the review: kept in
  `.riff/<review>/info-panel.json` and open again the next time riff opens
  the same review. A review riff has never saved folds for opens on its
  description; a file the reader has written wins, even one that folds
  the description. A section a
  `Ctrl-f` filter opened is not counted; the filter narrows for the
  moment, and the reader did not choose to keep it open.

- The summaries are coloured by meaning, from the theme alone, and
  sparingly: the merge verdict green, yellow or red; `+N` green and `-N`
  red; `N live` green; `N unresolved` yellow; other counts, times and
  joins in `subtext0`, readable but quieter than the section name; bot
  and author names in `overlay1`. The section names keep their colour:
  blue when active, `overlay0` otherwise. A header is never wrapped: at
  the panel's edge it ends in `…`, its flash label kept.

- **Previews** is a new section, built from spec 068.
- A comment whose content has been lifted into a section is folded away in
  Conversation, which says so: `Conversation (2 · 1 hidden)`. Nothing is
  dropped — it opens with a keystroke.
- `Ctrl-f` filters sections and rows (spec 065); `s` labels them (spec 066).
- `d` opens the diff at the file under the cursor when the cursor is on one.
- The fold keys are nvim's and the diff's, and one rule holds at every
  level. A section header is the parent of every row in its section; under
  Merge status a gate line is the parent of its checks or threads, and a
  check of its annotations; in Conversation a review is the parent of its
  threads. Every other row (a description line, a preview, a file, a
  commit, a pending reviewer) is a leaf.
  - `l` on a folded row or header opens it. On an open one it moves the
    cursor to its first child row; on a leaf, or an open row with no child
    rows (a comment whose body is open), it does nothing.
  - `h` on an open row or header folds it. On a child row or a folded row
    it moves the cursor to the parent, which stays open; on a folded header
    it does nothing.
  - `zo` opens the row or header under the cursor, and does nothing on a
    leaf or an open one. `zc` folds it when it is open; otherwise it folds
    the nearest open fold around it and puts the cursor there, the header
    when that fold is the section. `za` toggles a row or header that folds,
    and on a leaf does what `zc` does.
  - `zR` and `zM` open and fold every section. `zr` and `zm` are the same
    keys, as they are in the diff. Neither touches the folds inside a
    section, so a section reopens with its checks and threads as they were,
    and opening every failing check, which would fetch the annotations of
    each, is left to the reader. `zO` and `zC` are not bound.
  - Folding a section from one of its rows puts the cursor on its header,
    and is kept with the sections the reader opened.

## Technical Notes

`PRInfoPanelClass` holds `prInfo`, `files` and `comments` in private fields
set in its constructor, which is why a refresh has to swap the whole
instance. Section state (`activeSection`, `expandedSections`, scroll) lives in
the instance too, so preserving a position across a refresh (spec 063) means
either lifting that state out or handing it to the replacement.

Section headers are built from a config list (`sectionConfigs`) with a
`count` and a `summary` of coloured spans; the summaries themselves are
pure functions in `src/components/pr-info-summaries.ts`, and
`sectionHeaderRow` cuts each header to the panel's width.

The open sections are read and written by `src/storage/info-sections.ts`.
`initializeAppState` loads them beside the state rather than into it, and
the panel reports the reader's own folds through `setOnSectionsChange`.

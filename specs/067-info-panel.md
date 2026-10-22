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
- Sections are collapsed on arrival except **Merge status**
  ([108](./108-merge-status.md)) and **Description**, which are open. Each
  collapsed header carries its count and a one-glance summary right after
  it, two cells on; Merge status carries its verdict there, folded or not,
  and folded it names what blocks:

```
  ▼  Merge status  ✗ blocked
      ✗ Checks         40/42 · lint, e2e failing  ▼
      …
  ▼  Description (2)
      …
  ▶  Previews (6)  4 live · 2 on demand  ·  from deploy-bot[bot]
  ▶  Conversation (2)  1 unresolved
  ▶  Files (12)  +487 -53
  ▶  Commits (5)  last 17m
```

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

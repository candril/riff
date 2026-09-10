# Plan: Review Surfaces

**Status**: Plan

Orchestrates specs 063–070. Each is implementable on its own; this says in
what order and why, and records the decisions the specs assume.

## The goal

riff answers "what is this PR" well and "what happened since I looked" not at
all. The end state is three views, one key apart, each keeping its place:

```
                    a
        ┌───────────────────────┐
        ▼                       ▼
  ┌──────────┐            ┌──────────┐
  │  STATE   │            │   FEED   │      press the key of the view you
  │    i     │            │    a     │      are in → back where you came from
  └──────────┘            └──────────┘
        │  d                    │  d
        └──────────┬────────────┘
                   ▼
            ┌─────────────┐
            │    DIFF     │   i → state · a → feed
            └─────────────┘
```

- **State** (`i`) — what is true now: description, previews, checks,
  conversation, files, commits. Sections collapsed but for the description.
- **Feed** (`a`) — what happened, newest first, filterable by type.
- **Diff** (`d`) — unchanged, plus commit scoping from the feed.

## Order

```
  063 refresh in place ─────────────────────────────► (independent)

  064 surfaces ──┬── 065 text inputs ────────────────► (independent of the rest)
                 ├── 066 flash everywhere
                 ├── 067 info panel ── 068 preview links
                 └── 069 watermark ─── 070 feed
```

| # | Spec | Delivers | Done when |
|---|---|---|---|
| 063 | [Refresh in Place](./063-refresh-in-place.md) | `gr` changes the data and nothing else | Refreshing from a diff line leaves you on that line |
| 064 | [Surfaces & View Switching](./064-surfaces-and-view-switching.md) | `i`/`a`/`d`, focus routing, per-view position | The three keys switch and return; the feed is an empty shell |
| 065 | [Text Inputs & Filters](./065-text-inputs-and-filters.md) | Real input widgets everywhere; `Ctrl-f` means filter | `Ctrl-w` deletes a word in every prompt riff has |
| 066 | [Flash Everywhere](./066-flash-everywhere.md) | `s` jumps in tree, info and feed | One keystroke reaches any visible row anywhere |
| 067 | [Info Panel](./067-info-panel.md) | Metadata trimmed, sections at a glance, previews slot | Nothing on screen repeats the header line |
| 068 | [Preview Links](./068-preview-links.md) | Preview URLs as a list; open, copy; configurable | A bot's thirty-URL table reads as six rows |
| 069 | [Visit Watermark](./069-visit-watermark.md) | "Since your last visit" as data | `]n` jumps to the first comment you have not seen |
| 070 | [Activity Feed](./070-activity-feed.md) | The feed itself | `a` answers "what happened" without the browser |

**063 first**, because it is independent, small, and fixes a daily
irritation. **064 next and alone** — it is the seam everything else hangs
off, and `app/global-keys.ts` is already an 1100-line capture chain, so no
feature rides along with it. **065 and 066** are then free-standing
improvements that make the later views feel finished. **067 → 068** is the
state view; **069 → 070** is the feed, in that order because the watermark
is useful on its own and the feed's `unseen` filter needs it.

## Decisions already made

- `a` for the feed, not `f` — `f{char}` is find-char in the diff and does not
  move.
- The landing view is **state**, every time. No adaptive first-visit /
  return-visit behaviour: nothing about riff should change under you because
  of when you last opened it.
- Pressing the key of the current view returns to the previous one. One level
  of history.
- **No local mode** for state or feed. There is no PR to describe, and `i`
  and `a` stay no-ops there.
- The feed reads GitHub's **timeline API**; it is the only source that reports
  a force-push.
- riff never ticks a deploy checkbox. Preview rows open and copy, nothing
  else.
- Preview detection is **configured**, not compiled in — with defaults that
  work for most bots.
- Every text prompt uses OpenTUI's input widget, so `Ctrl-w` and the rest come
  from the widget rather than from riff.

## Not in scope anywhere here

- Writing to GitHub beyond what riff already does.
- A query language for filters.
- Streaming or live updates beyond the existing comment poll.
- Making a thirty-URL markdown table render well.

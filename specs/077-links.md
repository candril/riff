# Links

**Status**: Done

## Description

A PR description says "this is the second half of #1201" and links the ticket
it came from. In the diff, `gx` follows the URL under the cursor. In the PR
overview and the comments panel there is no cursor to put on it: the body is
rendered markdown, one block at a time, and the reader's only route out is to
retype the URL somewhere else — or reach for tmux's copy mode, which knows
nothing about which repo `#1201` belongs to.

`gx` should work there too. Since riff cannot ask "this one?" without a
cursor, it lists what it found instead.

```
  Links — Description                                       esc to back
 ──────────────────────────────────────────────────────────────────────
  🔗  #1217     OSA-62316 import the Swiss address register (merged)
  🔗  FVNO-132  https://jiradg.atlassian.net/browse/FVNO-132
  🔗  #1201     OSA-62316 serve address suggestions (closed)
```

## Out of Scope

- Clicking. A terminal that supports OSC 8 already makes a *rendered* URL
  clickable — the renderer attaches the href — but a `#1201` is not a URL
  and never becomes one, which is exactly the gap this fills.
- Hint labels over the text, tmux-fingers style. The markdown renderer is
  block-level: riff cannot paint a label onto a word inside a rendered
  paragraph without re-implementing inline layout.
- Paths. `gf` follows those, where there is a cursor to follow one from.

## Capabilities

### P1

- `gx` in the PR overview lists the links in whatever the cursor is on: the
  description, a conversation comment, a review, a commit message, a check's
  details URL.
- `gx` in the comments panel lists the links in the highlighted comment.
- A `#1213` is listed as what it points at — the title and state riff
  already resolved (spec 059) — not as a number.
- `Enter` opens, `Ctrl-y` copies, typing narrows the list.
- One link is not a question: it opens. None says so, rather than opening an
  empty picker.
- The same PR named three times in one paragraph is one row.
- A preview row's links are in there too, the build's own run included —
  which `Enter` and `y` never reached (spec 068). One picker for links, not
  one per section that happens to have some.

## Technical Notes

The picker is the palette's submenu (spec 042). Preview rows had grown their
own kind of it; there is one `links` kind now, carrying whether `Enter` or
`y` asked, so a row of deploy URLs and a paragraph full of references come up
in the same list.

Collection is `findReferences` (spec 059) and a new `findUrls` beside
`linkAt` in `utils/links.ts`, merged in written order with the references
winning any overlap: a reference pasted as a URL is one link, said the better
way.

# Kept Drafts

**Status**: Done

## Description

Esc on a half-written comment used to throw it away. It now keeps it: the
text stays with the line it was written against for the rest of the session,
and the next time the composer opens there — `c` from the diff, `n` from the
panel — it is already in the box.

## Out of Scope

- Writing drafts to disk. A draft is a thought in progress, not a review
  artefact; `Enter` is one keystroke away and saves a real local comment.
- A list of everywhere a draft is waiting. The panel says `n draft` when the
  line it is anchored on has one, and that is as far as this goes.
- Drafts for the PR-level comment box and the `$EDITOR` routes, which have
  their own buffers.

## Capabilities

### P1

- Esc in the composer keeps what was typed, keyed by the line it was written
  against — file, line and side — and says so.
- Esc on an empty composer throws the kept draft away. That is how you drop
  one deliberately.
- Opening the composer on that line prefills it, whether from the diff (`c`),
  from the panel (`n`), or by replying into the same anchor.
- A draft written while editing an existing comment belongs to that comment,
  not to the line: editing it again resumes the rewrite, and a new comment on
  the same line still starts empty.
- Saving the comment drops the draft.
- The panel's first hint reads `n draft` instead of `n new` when the anchor
  has one waiting.

## Technical Notes

The live textarea is what gets kept, not `inlineCommentOverlay.input`: state
mirrors keystrokes, but reading the composer directly cannot be a keystroke
behind — the same reason `Ctrl-g` hands the textarea's value to `$EDITOR`.

Drafts live in `createCommentDraftsState`
(`src/features/inline-comment-overlay/drafts-state.ts`), keyed
`filename:line:side`, or `edit:<comment id>` while editing. Callers name a
line or an edit (`DraftOn`, which `draftOn` reads off the overlay) and the
factory derives the key, so no call site has to know the shape of it. The
state updaters that open the composer never look a draft up: their callers
pass it as the prefill.

A reload (`gr`, switching PRs, opening the branch's PR) clears them. A
draft is keyed by file, line and side, and the reloaded diff can put other
code on that line, where the draft would come back on the wrong one.

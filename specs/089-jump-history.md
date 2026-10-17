# Jump History

**Status**: Done

## Description

`Ctrl-o` and `Ctrl-i` walk a jumplist that spec 038 built out of about twenty
hand-placed `recordJump()` calls, each one sitting in front of a navigation
that happened to remember it. The ones that forgot are invisible: the key
does something, it just does not do what the reader expects, and which
jumps are in the list is not a thing anyone can hold in their head.

That is the defect. Not a missing call site — the design that needs one.

A jump is recorded by watching where the reader was and where they ended up,
once, around every interaction — the keys from the one that starts it to the
moment nothing is waiting for more. Every navigation there is, and every navigation
written after this, is in the list without asking: the picker, the tree,
flash, thread motion, links, the feed, spec 088's occurrences when they
arrive.

## Out of Scope

- Persisting the list across sessions. It is a session's worth of where you
  have been; [090](./090-opening-screen.md) is where "across sessions" lives.
- A `:jumps` list to look at.
- The changelist (`g;` / `g,`), which is a different question — where you
  last *edited* — and riff does not edit.

## Capabilities

### P1

- Every interaction that lands somewhere else records where it came from.
  File, view, commit, cursor line: if any of them changed, the place before
  its first key was pressed is in the list. A search, a picker, flash and a
  chord such as `gg` or `]c` are one interaction each, however many keys
  they take, and whatever those keys would mean on their own.
- Stepping and scrolling inside a file are not jumps: `j`, `k`, the arrows,
  `Ctrl-d`, `Ctrl-u`, `Ctrl-e`, `Ctrl-y`, `h`, `l`, `w`, `b`, `e`, `0`, `^`,
  `$` and the like move the cursor without moving the reader, and so do the
  finds within a line, `f`, `F`, `t`, `T`, `;` and `,`. This is vim's own
  line between a motion and a jump.
- *Inside a file* is the whole of that exemption. The all-files view changes
  file by stepping off the end of one, with no file-switching key involved,
  and walking back the way you came has to include that. The file under the
  cursor is what decides — in that view there is no selected file to ask.
- `Ctrl-o` and `Ctrl-i` are not jumps either — walking the list does not
  extend it, even when it lands in another file.
- Nothing typed into a composer, a filter, a picker's input or any other
  text field records anything.
- A jump restores the column it left, not just the line.

### P2

- Pushing after walking back truncates the forward history, the list caps at
  100, and consecutive duplicates coalesce — as they do today.
- At either end the key does nothing, quietly.

## Out of Scope, found while building

- Navigation that no key caused. The recording hangs off the keypress, so a
  jump made by a mouse click or by something finishing asynchronously is not
  in the list. Neither exists in riff today.

## Technical Notes

The recording sits around `handleKeypress`, in the recorder of
`features/jumplist/recorder.ts`. Before and after each key it takes a
moment: the place, the file under the cursor, and whether the interaction
has settled (`app/jump-settled.ts`) — no prompt or picker, composer, search,
flash, half-typed chord (`g`, `z`, `[`, `]`, read from the global key
handler's `chordPending`), pending `f`/`t` character or pending text object.

A key that arrives while the last moment was settled starts an interaction
and decides its kind: a walk of the list (`Ctrl-o`, `Ctrl-i`, `tab`), a step
(the motions above), or a jump (everything else). Keys inside an open
interaction never reclassify it, which is why a flash label `j` or a search
for `hjkl` is a jump. When the interaction settles, a walk pushes nothing, a
step pushes its origin only when the file under the cursor changed, and a
jump pushes its origin when the place differs. Cancelling a search, a picker
or flash leaves the place where it was, so nothing is pushed.

One place, so a navigation cannot forget to be in the list — the twenty
`recordJump()` calls go, and nothing takes their place. Flash's list
surfaces still push in `jumpToRow`: a jump there moves a highlight, not the
place a jump captures. When it does move the place too, the recorder pushes
the same origin and the two coalesce.

A jump stores a mapping line, so folding, a refresh or a search that
expands a collapsed file can leave an entry pointing at a different line.

`apply` rebuilt the cursor with `createCursorState()`, which is why a jump
landed in column one. The column travels with the jump.

The list was also being wiped by file mode's read: `setFileDiff(state, name,
await …)` evaluates `state` before the await and assigns the result after,
so a file finishing its read undid everything the reader had done in the
meantime. The read comes first, the merge second.

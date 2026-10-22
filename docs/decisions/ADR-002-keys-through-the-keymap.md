# ADR-002: Keys reach the keymap through riff's own entry point

## Status
Accepted

## Context
riff moves its keys from the priority chain in `src/app/global-keys.ts` into `@opentui/keymap` layers ([spec 100](../../specs/100-solid-migration.md), M6), as tenor already holds them. The chain has 30-odd branches, and they move one or a few at a time, each step shipping on its own; for the length of the migration both dispatchers are live.

riff records navigation in one place: every keypress passes through the jump recorder ([spec 089](../../specs/089-jump-history.md)), which captures where the cursor was before an interaction and judges whether the interaction has settled, a pending chord included. Anything that handles a key outside that call escapes the jumplist.

The stock OpenTUI adapter (`createOpenTuiKeymapHost`) subscribes the keymap itself, with `prependListener` on `renderer.keyInput`.

| Approach | Pros | Cons |
|---|---|---|
| **A. Stock adapter.** The keymap listens on `keyInput` itself, ahead of riff's listener. | <ul><li>No host code of riff's own</li><li>tenor's setup unchanged</li></ul> | <ul><li>Keymap commands run outside the jump recorder: a navigation moved into a layer leaves the jumplist</li><li>A key the keymap took still reaches the chain unless every branch checks `defaultPrevented`</li><li>Two entry points for keys</li></ul> |
| **B. A host riff feeds.** The OpenTUI host in every respect but `onKeyPress`, which stores the listener; riff's one keypress listener offers each key to it and passes what it leaves to the chain. | <ul><li>One entry point, inside the jump recorder</li><li>The chain sees only what the keymap did not take, by construction</li><li>A pending sequence is visible to the recorder as a chord</li></ul> | <ul><li>A small host wrapper riff maintains against the keymap's `KeymapHost` interface</li></ul> |
| **C. Port the whole chain in one step.** | <ul><li>No period with two dispatchers</li></ul> | <ul><li>One unreviewable change across every feature's keys; a regression cannot be pinned to a branch</li></ul> |

## Decision
B. The jump recorder is riff's single entry point for keys, and moving branches one at a time needs the chain to see only what the keymap leaves. `createRiffKeymap` (`src/app/keymap.ts`) builds the keymap on that host with the addons `createDefaultOpenTuiKeymap` installs, and `composeKeys` (`src/app/keys-dispatch.ts`) puts it in front of the chain. Only `onKeyPress` goes through that entry point: `onKeyRelease` and `onRawInput` stay on the stock OpenTUI host, so a release binding or a raw intercept would run outside the jump recorder.

## Consequences
- Every binding in the keymap outranks every branch still in the chain. Branches move top-down in chain order, or the step that moves one out of order proves the two can never be active together.
- A handled binding calls `preventDefault`, so a focused input or textarea does not also receive that key. Where a chain branch swallowed a key without `preventDefault`, moving it can change what a focused field sees, and the step that moves it checks that. A key that breaks off a pending sequence is the exception: the keymap's `clearSequence` prevents and stops it, yet `key:after` reports it unhandled, so `offer()` returns false and the chain gets an already-prevented key that a focused input will not receive. The first layer with a multi-key binding checks what the chain and focused fields see after a sequence miss.
- The keymap matches modifiers exactly where the chain matched a key by name, so a layer that takes over a branch which ignored modifiers binds every ctrl, shift, meta, super and hyper variant of its keys; alt and option arrive as meta (`anyModifiers`, `src/app/key-variants.ts`).
- A modal that captures every key (flash, the confirm dialog) registers `capture` next to its layer, so the chain never sees a key while that modal is active. A capture does not prevent the keys it keeps, so a modal whose focused field types what it leaves unbound (the command palette) captures without a `rest` handler and its field still receives them. Of two enabled layers binding a key, and of two active captures, the later registered wins.
- A capture decides per key: `active` receives the key, so a modal can leave one to the chain (the help overlay's bare `g`, which `g?` needs). A layer that must yield to a chord the chain holds reads the chain's own pending key (`createKeyHandler`'s `chordPending`), not the composed one. Every modal layer is enabled by its capture's `holds()`, plus any condition of its own, and so runs only while that capture is the one holding the key: it stands aside under every modal that outranks it, even for keys that modal leaves unbound. The help overlay is where this shows today, since the pickers and Submit Review that its `g`-chords open over it type its j, k and q; enabled by their own state alone, the palette and the pickers would run the keys the confirmation dialog leaves unbound, and the dialog would take y and n from flash drawn over it. `holds()` is true only while `offer()` feeds a key, so a keymap query outside dispatch (an active-keys list, a which-key display, a palette catalog filtered by enabled) sees these layers as disabled; whoever builds such a view has to account for that.
- `chordPending` covers both the chain's `pendingKey` and the keymap's pending sequence, so the jump recorder keeps judging a chord as one interaction whichever side holds it.
- The palette and help keep their display-only `shortcut` strings until the commands they name live in the keymap; `getCommandEntries` becomes the catalog then, as in tenor's `src/app/registry.ts`.

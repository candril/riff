import type { RiffKeymap } from "./keymap"
import type { AppKeyContext } from "./key-context"
import type { BlameKeys } from "../features/blame/keys"
import type { PeekKeyContext } from "./peek-leaves"
import { registerBlamePeekKeys } from "../features/blame/peek-keys"
import { registerLinePeekKeys } from "../features/line-peek/keys"

type Chord = { chordPending(): boolean }

/**
 * The blame peek and the line peek. The blame peek outranks the line peek,
 * so it registers second: later registration wins. `blame` is the one the
 * `g` layer's `gb` and `go` reach, so a single object owns every blame
 * request.
 */
export function registerPeekKeys(riffKeymap: RiffKeymap, ctx: AppKeyContext, chord: Chord, blame: BlameKeys): () => void {
  const peek: PeekKeyContext = {
    getState: ctx.getState,
    getVimState: ctx.getVimState,
    searchActive: () => ctx.getSearchState().active,
    filePicker: ctx.filePicker,
    commentsPicker: ctx.commentsPicker,
    occurrencePicker: ctx.occurrencePicker,
    marksPicker: ctx.marksPicker,
    commitPicker: ctx.commitPicker,
    chordPending: () => chord.chordPending(),
  }
  const unregisterLinePeek = registerLinePeekKeys(riffKeymap, {
    ...peek,
    setState: ctx.setState,
    render: ctx.render,
    // The terminal's rows rather than the renderer's height, which parts
    // from them wherever stdout is not a terminal.
    height: () => process.stdout.rows ?? 40,
  })
  const unregisterBlamePeek = registerBlamePeekKeys(riffKeymap, { ...peek, blame })
  return () => {
    unregisterLinePeek()
    unregisterBlamePeek()
  }
}

import type { RiffKeymap } from "./keymap"
import type { AppKeyContext } from "./key-context"
import type { BlameKeys } from "../features/blame/keys"
import type { PeekKeyContext } from "./peek-leaves"
import { registerBlamePeekKeys } from "../features/blame/peek-keys"
import { registerLinePeekKeys } from "../features/line-peek/keys"

type Chain = { chordPending(): boolean }

/**
 * The blame peek and the line peek. The chain asked the blame peek first,
 * so it registers second: later registration wins. `blame` is the one `gb`
 * and `go` reach through the chain, so a single object owns every blame
 * request.
 */
export function registerPeekKeys(riffKeymap: RiffKeymap, ctx: AppKeyContext, chain: Chain, blame: BlameKeys): () => void {
  const peek: PeekKeyContext = {
    getState: ctx.getState,
    getVimState: ctx.getVimState,
    searchActive: () => ctx.getSearchState().active,
    chainChordPending: () => chain.chordPending(),
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

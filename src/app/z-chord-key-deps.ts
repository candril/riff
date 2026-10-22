import type { GlobalKeyContext } from "./global-keys"
import type { ZChordDeps } from "./z-chord-commands"
import type { ZChordKeyDeps } from "./z-chord-keys"
import { feedExpandDeps } from "./feed-key-deps"
import { blameKeysContext } from "./blame-key-deps"
import { createBlameColumnKeys } from "../features/blame/column-keys"
import * as feed from "../features/feed"

/** What the `z` chords need of the app. */
export function zChordDeps(ctx: GlobalKeyContext): ZChordDeps {
  return {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    rebuildLineMapping: () => ctx.rebuildLineMapping(),
    getVimState: ctx.getVimState,
    setVimState: ctx.setVimState,
    cursorView: ctx.cursorView,
    foldsContext: ctx.foldsContext,
    toggleFeedRow: () => feed.toggleExpandedRow(feedExpandDeps(ctx)),
    blameColumn: createBlameColumnKeys(blameKeysContext(ctx)),
  }
}

/** What the z layer needs of the app, and of the chain behind it, the chord it holds. */
export function zChordKeyDeps(ctx: GlobalKeyContext, chain: { chordPending(): boolean }): ZChordKeyDeps {
  return { ...zChordDeps(ctx), chain }
}

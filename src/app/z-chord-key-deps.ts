import type { AppKeyContext } from "./key-context"
import type { ZChordDeps } from "./z-chord-commands"
import { feedExpandDeps } from "./feed-key-deps"
import * as feed from "../features/feed"

/** What the `z` chords need of the app. */
export function zChordDeps(ctx: AppKeyContext): ZChordDeps {
  return {
    getState: ctx.getState,
    setState: ctx.setState,
    diffOptions: ctx.diffOptions,
    render: ctx.render,
    rebuildLineMapping: () => ctx.rebuildLineMapping(),
    getVimState: ctx.getVimState,
    setVimState: ctx.setVimState,
    cursorView: ctx.cursorView,
    foldsContext: ctx.foldsContext,
    toggleFeedRow: () => feed.toggleExpandedRow(feedExpandDeps(ctx)),
    linePeek: ctx.linePeek,
    blamePeek: ctx.blamePeek,
  }
}

import type { KeyEvent } from "@opentui/core"
import type { GlobalKeyContext } from "./global-keys"
import type { GChordDeps } from "./g-chord-commands"
import type { GChordKeyDeps } from "./g-chord-keys"
import type { BlameKeys } from "../features/blame/keys"
import { followLinkContext } from "./follow-link-deps"
import { appKeyTakes } from "./app-keys"

/**
 * What the `g` chords need of the app. `blame` is the object createAppKeys
 * shares with the blame peek's layer, so a single one owns every request.
 */
export function gChordDeps(ctx: GlobalKeyContext, blame: BlameKeys): GChordDeps {
  return {
    getState: ctx.getState,
    setState: ctx.setState,
    render: ctx.render,
    executeAction: ctx.executeAction,
    reviewPreviewOpenContext: ctx.reviewPreviewOpenContext,
    syncPreviewOpenContext: ctx.syncPreviewOpenContext,
    prInfoPanelOpenContext: ctx.prInfoPanelOpenContext,
    externalToolsContext: ctx.externalToolsContext,
    foldsContext: ctx.foldsContext,
    refreshContext: ctx.refreshContext,
    followLinkContext: followLinkContext(ctx),
    blame,
  }
}

/**
 * What the g layer needs of the app, of the chain behind it, the chord it
 * holds, and of the chat, which a key it reaches is asked about first.
 */
export function gChordKeyDeps(
  ctx: GlobalKeyContext,
  blame: BlameKeys,
  chain: { chordPending(): boolean },
  askedFirst: (key: KeyEvent) => boolean,
): GChordKeyDeps {
  return { ...gChordDeps(ctx, blame), chain, askedFirst, ignoresChords: appKeyTakes }
}

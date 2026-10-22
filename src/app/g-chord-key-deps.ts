import type { GlobalKeyContext } from "./global-keys"
import type { GChordDeps } from "./g-chord-commands"
import type { BlameKeys } from "../features/blame/keys"
import { followLinkContext } from "./follow-link-deps"

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

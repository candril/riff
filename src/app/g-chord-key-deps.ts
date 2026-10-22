import type { KeyEvent } from "@opentui/core"
import type { AppKeyContext } from "./key-context"
import type { GChordDeps } from "./g-chord-commands"
import type { GChordKeyDeps } from "./g-chord-keys"
import type { BlameKeys } from "../features/blame/keys"
import { followLinkContext } from "./follow-link-deps"
import { appKeyTakes } from "./app-keys"

/**
 * What the `g` chords need of the app. `blame` is the object createAppKeys
 * shares with the blame peek's layer, so a single one owns every request.
 */
export function gChordDeps(ctx: AppKeyContext, blame: BlameKeys): GChordDeps {
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
 * What the g layer needs beyond gChordDeps: the keys its pending `g` must
 * not swallow. They come from outside because they are other layers' keys,
 * the chat's reach (askedFirst) and the app layer's (ignoresChords).
 */
export function gChordKeyDeps(ctx: AppKeyContext, blame: BlameKeys, askedFirst: (key: KeyEvent) => boolean): GChordKeyDeps {
  return { ...gChordDeps(ctx, blame), askedFirst, ignoresChords: appKeyTakes }
}

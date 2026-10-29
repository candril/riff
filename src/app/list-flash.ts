import type { AppState } from "../state"
import { getInlineCommentOverlayComments } from "../state"
import { visibleFeedRows } from "../features/feed/rows"
import type { FlashSurface } from "../vim-diff/flash-state"
import { treeRowsOf } from "../components"
import { visibleOverlayCommentIds } from "../components/thread-panel-window"
import { feedRowsInView } from "../components/feed-window"
import type { AppKeyContext } from "./key-context"
import { threadPanelGeometry } from "./thread-panel-geometry"

/**
 * Which list `s` labels, or null when the diff has the cursor and its own
 * search-then-label flavour applies (spec 066).
 */
export function flashSurface(state: AppState): FlashSurface | null {
  // The comments panel is checked first: it is an overlay, so it has focus
  // over whichever view is behind it.
  if (state.focusedPanel === "comments" && state.inlineCommentOverlay.mode === "view") {
    return "comments"
  }
  if (state.viewMode === "state") return "state"
  if (state.viewMode === "feed") return "feed"
  if (state.focusedPanel === "tree") return "tree"
  return null
}

export function flashTargets(
  state: AppState,
  ctx: Pick<AppKeyContext, "fileTreePanel" | "getPrInfoPanel" | "renderer" | "activityFeed" | "visit" | "chat" | "composer">,
): string[] {
  switch (flashSurface(state)) {
    case "tree": {
      const count = treeRowsOf(state).length
      const { first, last } = ctx.fileTreePanel.visibleRows()
      const ids: string[] = []
      for (let index = first; index <= Math.min(last, count - 1); index++) ids.push(String(index))
      return ids
    }
    case "state":
      return ctx.getPrInfoPanel()?.flashTargets() ?? []
    case "feed": {
      const feed = ctx.activityFeed.snapshot()
      return feedRowsInView(visibleFeedRows(feed, state.comments, ctx.visit.watermark()), feed, ctx.renderer.height).map(String)
    }
    case "comments":
      return visibleOverlayCommentIds(
        getInlineCommentOverlayComments(state),
        state.inlineCommentOverlay.expandedThreadIds,
        state.inlineCommentOverlay.highlightedIndex,
        state.inlineCommentOverlay.expanded,
        threadPanelGeometry(state, { open: ctx.chat.column.open(), expanded: ctx.chat.column.expanded() }, ctx.renderer, ctx.composer.value).budget
      )
    default:
      return []
  }
}

/**
 * Keys the surface acts on, kept out of the label alphabet so a mistyped
 * jump cancels rather than marking a file viewed or resolving a thread.
 */
export function reservedKeysFor(surface: FlashSurface): string {
  switch (surface) {
    case "tree":
      return "vx"
    case "state":
      return "xc"
    case "comments":
      // Reply, edit, delete and resolve: the keys whose mistake costs the
      // most are the ones flash refuses to be confused with.
      return "redx"
    default:
      return ""
  }
}

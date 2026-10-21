/**
 * App render coordination
 *
 * Creates the main render function that orchestrates all UI updates.
 */

import { TextRenderable } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { keepAlive } from "../utils/renderables"
import { markCommentsSeen } from "../state"
import type { FeedIsland } from "./feed"
import type { SplitDiff } from "./split-diff"
import type { UnifiedDiff } from "./unified-diff"
import type { PRInfoPanelClass } from "../components"
import { colors } from "../theme"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { FileParses } from "../vim-diff/file-parses"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { FlashState } from "../vim-diff/flash-state"
import { splitOn as isSplitOn } from "./column-status"
import { commentsSeenOnScreen } from "./comments-seen"
import { createDiffPass } from "./diff-pass"
import { viewSlotOf, type ViewSlot } from "./view-slot"
import { diffCursorShown } from "./diff-focus"
import { promptOpenIn } from "./open-prompt"
import type { AppShell } from "./shell"
import type { Frame } from "./frame"

export interface RenderContext {
  // Mutable state accessors
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  getLineMapping: () => DiffLineMapping
  getSearchState: () => SearchState
  getFlashState: () => FlashState
  getCachedCurrentUser: () => string | null
  /** Returns the persistent PRInfoPanel instance (PR mode only; null in local mode). */
  getPrInfoPanel: () => PRInfoPanelClass | null
  // UI panels
  renderer: CliRenderer
  shell: AppShell
  feed: FeedIsland
  split: SplitDiff
  unified: UnifiedDiff
  /** The files' own text and their parses, which both diff views colour rows from. */
  parses: FileParses
  // Helper
  updateFileTreePanel: () => void
  /** Hands the pass's snapshot to every view that derives its own model from it. */
  publishFrame: (frame: Frame) => void
}

/**
 * Create the main render function
 */
export function createRenderFunction(ctx: RenderContext): () => void {
  const errorText = keepAlive(new TextRenderable(ctx.renderer, { fg: colors.error }))
  const emptyText = keepAlive(new TextRenderable(ctx.renderer, { content: "No changes to display", fg: colors.textDim }))
  const diffPass = createDiffPass(ctx)

  return function render() {
    const state = ctx.getState()
    const vimState = ctx.getVimState()
    const mapping = ctx.getLineMapping()
    const searchState = ctx.getSearchState()
    const flashState = ctx.getFlashState()
    const now = Date.now()

    ctx.updateFileTreePanel()
    // After the panel update, which sets the width the diff pane is measured against.
    const splitOn = isSplitOn(state, ctx.split)
    const focused = diffCursorShown(state, promptOpenIn(state, searchState))

    const prInfoPanel = ctx.getPrInfoPanel()
    const { slot, withTree } = viewSlotOf(state, { overview: prInfoPanel !== null })
    // Mounted once the frame is published.
    const view = viewOf(slot)
    diffPass.draw({ state, vimState, mapping, searchState, flashState, focused, diffShown: slot === "diff", splitOn })

    if (state.visit) {
      const conversationOpen = state.viewMode === "state" && !!prInfoPanel?.isSectionExpandedNamed("conversation")
      const seen = commentsSeenOnScreen(state, { conversationOpen })
      ctx.setState((s) => markCommentsSeen(s, seen))
    }

    const frame: Frame = {
      state,
      vimState,
      mapping,
      searchState,
      flashState,
      cachedCurrentUser: ctx.getCachedCurrentUser(),
      width: ctx.renderer.width,
      height: ctx.renderer.height,
      now,
      diff: diffPass.readout(splitOn, state.viewMode, vimState),
    }

    // The composer and the prompts focus their fields as publish's first
    // followers; the chat, which takes the keys only while neither is up, and
    // the review preview, which focuses its summary as it opens, follow them,
    // all before this call returns.
    ctx.publishFrame(frame)

    ctx.shell.setView(view, { withTree })

    function viewOf(shown: ViewSlot) {
      switch (shown) {
        case "error":
          errorText.content = `Error: ${state.error}`
          return errorText
        case "overview":
          return prInfoPanel!.getContainer()
        case "feed":
          return ctx.feed.host
        case "empty":
          return emptyText
        case "diff":
          return splitOn ? ctx.split.island.host : ctx.unified.island.host
      }
    }
  }
}

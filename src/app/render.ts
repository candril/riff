/**
 * App render coordination
 *
 * Creates the main render function that orchestrates all UI updates.
 */

import { TextRenderable } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { keepAlive } from "../utils/renderables"
import { getInlineCommentOverlayComments, markCommentsSeen } from "../state"
import type { FeedIsland } from "./feed"
import type { SplitDiff } from "./split-diff"
import type { UnifiedDiff } from "./unified-diff"
import type { PRInfoPanelClass } from "../components"
import { colors } from "../theme"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import { selectionStatus } from "./selection-status"
import type { FileParses } from "../vim-diff/file-parses"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { FlashState } from "../vim-diff/flash-state"
import { diffColumnStatus, splitOn as isSplitOn } from "./column-status"
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

  return function render() {
    const state = ctx.getState()
    const vimState = ctx.getVimState()
    const lineMapping = ctx.getLineMapping()
    const searchState = ctx.getSearchState()
    const flashState = ctx.getFlashState()
    const now = Date.now()

    // Update file tree panel state
    ctx.updateFileTreePanel()
    // After the panel update, which sets the width the diff pane is measured against.
    const splitOn = isSplitOn(state, ctx.split)

    const diffFocused = diffCursorShown(state, promptOpenIn(state, searchState))

    // Main content based on view mode, mounted once the frame is published.
    let view
    let withTree = true
    let unifiedOn = false
    const prInfoPanelInstance = ctx.getPrInfoPanel()
    if (state.error) {
      errorText.content = `Error: ${state.error}`
      view = errorText
      withTree = false
    } else if (state.viewMode === "state" && prInfoPanelInstance) {
      // PR overview (spec 041): mount the panel inline next to the tree.
      view = prInfoPanelInstance.getContainer()
    } else if (state.viewMode === "feed") {
      view = ctx.feed.host
    } else if (state.files.length === 0) {
      view = emptyText
      withTree = false
    } else {
      // The text of the files riff has already read, so they can be
      // highlighted as files rather than as the rows on screen (spec 080).
      ctx.parses.set(
        new Map(
          Object.entries(state.fileContentCache).flatMap(([filename, entry]) =>
            entry?.newContent
              ? [[filename, { new: entry.newContent, old: entry.oldContent }] as const]
              : []
          )
        )
      )
      // Fed while split is drawn too, so toggling back has nothing to rebuild.
      ctx.unified.draw({
        mapping: lineMapping,
        state,
        vimState,
        searchState,
        flashState,
        emptyMessage: state.treeFilter ? `No files match /${state.treeFilter}` : "No changes to display",
        focused: diffFocused,
      })
      if (splitOn) ctx.split.draw({ mapping: lineMapping, state, vimState, searchState, flashState })

      view = splitOn ? ctx.split.island.host : ctx.unified.island.host
      unifiedOn = !splitOn
    }
    ctx.unified.syncDrawn(unifiedOn)
    ctx.split.syncDrawn(splitOn, ctx.unified.viewportHeight())

    // What is on screen has been read (spec 069): the comments the panel
    // is showing, and the threads of an open Conversation section. Being
    // in the PR is not the same as having read it, so nothing else counts.
    if (state.visit) {
      const seen: string[] = []
      if (state.inlineCommentOverlay.open) {
        for (const comment of getInlineCommentOverlayComments(state)) seen.push(comment.id)
      }
      if (state.viewMode === "state" && prInfoPanelInstance?.isSectionExpandedNamed("conversation")) {
        for (const comment of state.comments) seen.push(comment.id)
      }
      ctx.setState((s) => markCommentsSeen(s, seen))
    }

    if (splitOn) ctx.split.island.update({ focused: diffFocused })

    const frame: Frame = {
      state,
      vimState,
      mapping: lineMapping,
      searchState,
      flashState,
      cachedCurrentUser: ctx.getCachedCurrentUser(),
      width: ctx.renderer.width,
      height: ctx.renderer.height,
      now,
      diff: {
        columnInfo: diffColumnStatus(splitOn, {
          viewMode: state.viewMode,
          split: ctx.split,
          unified: ctx.unified,
        }),
        // Split counts the rows it draws: a pair row holds a removal and an addition.
        selectionInfo: splitOn ? ctx.split.selectionStatus(vimState) : selectionStatus(vimState),
      },
    }

    // The composer and the prompts focus their fields as publish's first
    // followers; the chat, which takes the keys only while neither is up, and
    // the review preview, which focuses its summary as it opens, follow them,
    // all before this call returns.
    ctx.publishFrame(frame)

    // The tree has nothing to list without files, whatever the view.
    ctx.shell.setView(view, { withTree: withTree && state.files.length > 0 })
  }
}

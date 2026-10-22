/**
 * The `z` chords, one command each, keyed by the sequence the chain spells
 * for them: the opener, the chord suffix of the second key.
 */

import type { AppState } from "../state"
import { toggleWrapLines } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffViewport } from "./diff-viewport"
import * as folds from "../features/folds"

export interface ZChordDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  rebuildLineMapping: () => void
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  cursorView: Pick<
    DiffViewport,
    "scrollCursorTo" | "scrollColumnsBy" | "halfColumnWindow" | "scrollColumnToEdge" | "clampColumnToWindow"
  >
  foldsContext: folds.FoldsContext
  /** `za` in the feed: the commit row under the cursor opened into the files it touched, or closed. */
  toggleFeedRow: () => void
  /** `zB`: the blame column for the file under the cursor (spec 103). */
  blameColumn: { toggle(): void }
}

// Both spellings of a shifted letter are accepted because terminals differ
// in whether shift+letter reports the key name as lower- or uppercase.
export const Z_SEQUENCES = {
  za: "toggleFold",
  "zA!": "toggleFileBlocks",
  "za!": "toggleFileBlocks",
  "zR!": "expandAllFolds",
  "zr!": "expandAllFolds",
  zr: "expandAllFolds",
  "zM!": "collapseAllFolds",
  "zm!": "collapseAllFolds",
  zm: "collapseAllFolds",
  zw: "toggleWrap",
  "zB!": "toggleBlameColumn",
  "zb!": "toggleBlameColumn",
  zl: "scrollRight",
  zh: "scrollLeft",
  "zL!": "scrollHalfRight",
  "zl!": "scrollHalfRight",
  "zH!": "scrollHalfLeft",
  "zh!": "scrollHalfLeft",
  zs: "scrollCursorColumnToStart",
  ze: "scrollCursorColumnToEnd",
  zz: "scrollCursorToCenter",
  zt: "scrollCursorToTop",
  zb: "scrollCursorToBottom",
  zo: "openFold",
  zc: "closeFold",
} as const

export type ZCommand = (typeof Z_SEQUENCES)[keyof typeof Z_SEQUENCES]

/** Every command takes its key: no `z` chord leaves one to the chain's tail. */
export function zChordCommands(deps: ZChordDeps): Record<ZCommand, () => boolean> {
  /**
   * Scroll the diff sideways and bring the cursor with it. Leaving the
   * cursor behind would hide it the moment it left the window, which is
   * how vim behaves too.
   */
  function scrollColumns(delta: number): void {
    deps.cursorView.scrollColumnsBy(delta)
    const vimState = deps.getVimState()
    const col = deps.cursorView.clampColumnToWindow(vimState.line, vimState.col)
    if (col !== vimState.col) {
      deps.setVimState({ ...vimState, col, desiredCol: null })
    }
    deps.render()
  }
  const taking = (run: () => void) => () => {
    run()
    return true
  }
  const halfColumns = (dir: 1 | -1) =>
    taking(() => scrollColumns(deps.cursorView.halfColumnWindow(deps.getVimState().line) * dir))
  const columnToEdge = (edge: "start" | "end") =>
    taking(() => {
      const vimState = deps.getVimState()
      deps.cursorView.scrollColumnToEdge(vimState.line, vimState.col, edge)
      deps.render()
    })
  const cursorTo = (where: "center" | "top" | "bottom") =>
    taking(() => {
      deps.cursorView.scrollCursorTo(deps.getVimState().line, where)
      deps.render()
    })
  return {
    toggleFold: taking(() => {
      // In the feed, `za` opens a commit row into the files it touched.
      if (deps.getState().viewMode === "feed") deps.toggleFeedRow()
      else folds.handleToggleFoldAtCursor(deps.foldsContext)
    }),
    // Every fenced block in this file at once (spec 073).
    toggleFileBlocks: taking(() => folds.handleToggleFileBlocks(deps.foldsContext)),
    expandAllFolds: taking(() => folds.handleExpandAllFolds(deps.foldsContext)),
    collapseAllFolds: taking(() => folds.handleCollapseAllFolds(deps.foldsContext)),
    toggleWrap: taking(() => {
      // The mapping is rebuilt because markdown table padding is applied
      // there and is dropped while wrapping. Drawing the new mapping
      // brings the cursor back into view.
      deps.setState(toggleWrapLines)
      deps.rebuildLineMapping()
      deps.render()
    }),
    toggleBlameColumn: taking(() => {
      if (deps.getState().viewMode === "diff") deps.blameColumn.toggle()
    }),
    scrollRight: taking(() => scrollColumns(1)),
    scrollLeft: taking(() => scrollColumns(-1)),
    scrollHalfRight: halfColumns(1),
    scrollHalfLeft: halfColumns(-1),
    scrollCursorColumnToStart: columnToEdge("start"),
    scrollCursorColumnToEnd: columnToEdge("end"),
    scrollCursorToCenter: cursorTo("center"),
    scrollCursorToTop: cursorTo("top"),
    scrollCursorToBottom: cursorTo("bottom"),
    openFold: taking(() => folds.handleOpenFoldAtCursor(deps.foldsContext)),
    closeFold: taking(() => folds.handleCloseFoldAtCursor(deps.foldsContext)),
  }
}

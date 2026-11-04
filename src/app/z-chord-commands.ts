/**
 * The `z` chords, one command each, keyed by the sequence they are spelled
 * as: the opener, the chord suffix of the second key.
 */

import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { LinePeekState } from "../features/line-peek/state"
import type { BlamePeekState } from "../features/blame/peek-state"
import type { DiffViewport } from "./diff-viewport"
import * as folds from "../features/folds"
import type { DiffOptionsState } from "../features/diff-view/options-state"

export interface ZChordDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  diffOptions: Pick<DiffOptionsState, "toggleWrap">
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
  /** Whether the line peek is up, under which no `z` chord acts. */
  linePeek: Pick<LinePeekState, "open">
  /** Whether the blame peek is up, under which no `z` chord acts. */
  blamePeek: Pick<BlamePeekState, "open">
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
  // Bound to nothing, but taken: a z sequence that breaks off hands its
  // second key on, and this one would reach the diff as `B`, WORD back.
  "zB!": "swallow",
  "zb!": "swallow",
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

/**
 * Each command's key as the palette spells it, beside the action the
 * command runs, and the key the palette runs the command on. It matters
 * where several chords run one command: the palette names `zR`, not `zr`.
 */
export const Z_PALETTE_KEYS: Partial<Record<ZCommand, string>> = {
  toggleFold: "za",
  openFold: "zo",
  closeFold: "zc",
  expandAllFolds: "zR",
  collapseAllFolds: "zM",
  toggleWrap: "zw",
}

/** Every command takes its key: no `z` chord leaves one to the layers behind. */
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
      deps.diffOptions.toggleWrap()
      deps.rebuildLineMapping()
      deps.render()
    }),
    swallow: taking(() => {}),
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

import { treeRowsOf } from "../components/FileTree"
import type { AppState } from "../state"
import { keepDiffFileInTree } from "./tree-unviewed"

/** The tree row the panel last drew highlighted, by index and by what sits there. */
export interface ShownHighlight {
  index: number
  path: string | null
}

export function shownHighlightOf(state: AppState): ShownHighlight {
  return { index: state.treeHighlightIndex, path: treeRowsOf(state)[state.treeHighlightIndex]?.node.path ?? null }
}

/**
 * Point the tree at the file the diff cursor is in.
 *
 * Only in the all-files view, and only while the tree is not the panel
 * being driven: `j`/`k` there moves the highlight without moving the
 * diff, and a multi-select range would be dragged out from under the
 * user. A file inside a collapsed directory is left alone rather than
 * expanded — scrolling past it should not undo a fold.
 */
export function followCursorInTree(state: AppState, cursorFile: string | null): AppState {
  if (state.selectedFileIndex !== null) return state
  if (state.focusedPanel === "tree" || state.treeSelectionAnchor !== null) return state
  if (!cursorFile) return state

  const index = treeRowsOf(state).findIndex(
    (item) => item.fileIndex !== undefined && state.files[item.fileIndex]?.filename === cursorFile
  )
  if (index === -1 || index === state.treeHighlightIndex) return state
  return { ...state, treeHighlightIndex: index }
}

/**
 * The highlight the tree should draw, and whether the panel should scroll
 * to it. Many writers set the highlight themselves — the file picker, `]f`,
 * a refresh — so a highlight that differs from the one last drawn is the
 * cue, not only a move made here. The first push has nothing to differ
 * from, and startup should not scroll for it.
 */
export function syncTreeHighlight(
  state: AppState,
  cursorFile: string | null,
  lastShown: ShownHighlight | null
): { state: AppState; reveal: boolean; shown: ShownHighlight } {
  const next = followCursorInTree(keepDiffFileInTree(state, cursorFile), cursorFile)
  const shown = shownHighlightOf(next)
  const moved = next.treeHighlightIndex !== state.treeHighlightIndex
  const changed = lastShown !== null && (lastShown.index !== shown.index || lastShown.path !== shown.path)
  return { state: next, reveal: moved || changed, shown }
}

/**
 * The tree panel's half of syncTreeHighlight: app.ts and the test harness
 * both push through this, so what the tests see scroll is what riff does.
 * `shown` is for every other push into the panel, which must keep the last
 * drawn highlight in step or the next sync reveals it again.
 */
export function createTreeHighlightSync(panel: { ensureHighlightVisible(): void }) {
  let lastShown: ShownHighlight | null = null
  return {
    sync(state: AppState, cursorFile: string | null, push: (state: AppState) => void): AppState {
      const synced = syncTreeHighlight(state, cursorFile, lastShown)
      push(synced.state)
      lastShown = synced.shown
      if (synced.reveal) panel.ensureHighlightVisible()
      return synced.state
    },
    shown(state: AppState): void {
      lastShown = shownHighlightOf(state)
    },
  }
}

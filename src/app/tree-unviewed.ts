import { treeRowsOf } from "../components/FileTree"
import { keepTreeFile, toggleTreeUnviewedOnly, type AppState } from "../state"
import { updatePanelFilters, type PanelFilters } from "../storage"

export type SavePanelFilters = (source: string, patch: Partial<PanelFilters>) => Promise<void>

/** The file the reader is on: the tree's highlighted file while it has focus, else the diff's. */
export function readerFileOf(state: AppState, cursorFile: string | null): string | null {
  if (state.focusedPanel === "tree") {
    const row = treeRowsOf(state)[state.treeHighlightIndex]
    if (row?.node.file) return row.node.file.filename
  }
  return diffReaderFileOf(state, cursorFile)
}

function diffReaderFileOf(state: AppState, cursorFile: string | null): string | null {
  if (state.selectedFileIndex !== null) return state.files[state.selectedFileIndex]?.filename ?? null
  return cursorFile
}

/** `H` in the file tree, remembered with the review so it opens as it was left. */
export function toggleUnviewedFilesOnly(
  state: AppState,
  cursorFile: string | null,
  save: SavePanelFilters = updatePanelFilters
): AppState {
  const next = toggleTreeUnviewedOnly(state, readerFileOf(state, cursorFile))
  void save(next.source, { unviewedFilesOnly: next.treeUnviewedOnly })
  return next
}

/**
 * While the diff has focus, its file stays in the tree, so the row the tree
 * follows never vanishes because it was viewed. A narrowed file is pointed at
 * here too: it may have been hidden when `]f` picked it, which left the
 * highlight where it was.
 */
export function keepDiffFileInTree(state: AppState, cursorFile: string | null): AppState {
  if (!state.treeUnviewedOnly || state.focusedPanel === "tree") return state
  const kept = keepTreeFile(state, diffReaderFileOf(state, cursorFile))
  if (kept.selectedFileIndex === null) return kept
  const index = treeRowsOf(kept).findIndex((item) => item.fileIndex === kept.selectedFileIndex)
  return index !== -1 && index !== kept.treeHighlightIndex ? { ...kept, treeHighlightIndex: index } : kept
}

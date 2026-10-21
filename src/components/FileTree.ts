import type { DiffFile } from "../utils/diff-parser"
import type { FileTreeNode, FlatTreeItem } from "../utils/file-tree"
import type { AppState } from "../state"
import { flattenTree } from "../utils/file-tree"
import { visibleTreeItems, type ViewedFilter } from "./file-tree-model"

/**
 * Get flattened tree items (for keyboard navigation)
 */
export function getFlatTreeItems(
  fileTree: FileTreeNode[],
  files: DiffFile[]
): FlatTreeItem[] {
  return flattenTree(fileTree, files)
}

/**
 * The rows the file tree island draws, for navigation to index into. Every
 * reader asks here, so a filter on the tree reaches the cursor and the
 * drawing alike.
 */
export function treeRowsOf(state: AppState): FlatTreeItem[] {
  return visibleTreeItems(
    state.fileTree,
    state.files,
    state.ignoredFiles,
    state.showHiddenFiles,
    state.treeFilter,
    treeViewedFilterOf(state)
  )
}

/**
 * The rows with every viewed file left in: `]f` and `[f` walk the diff, and
 * the diff keeps every file whatever the tree hides.
 */
export function treeRowsWithViewedOf(state: AppState): FlatTreeItem[] {
  return visibleTreeItems(state.fileTree, state.files, state.ignoredFiles, state.showHiddenFiles, state.treeFilter)
}

export function treeViewedFilterOf(state: AppState): ViewedFilter | null {
  return state.treeUnviewedOnly ? { statuses: state.fileStatuses, keep: state.treeKeptFile } : null
}

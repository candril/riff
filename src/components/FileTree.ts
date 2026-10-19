import type { DiffFile } from "../utils/diff-parser"
import type { FileTreeNode, FlatTreeItem } from "../utils/file-tree"
import { flattenTree } from "../utils/file-tree"
import { visibleTreeItems } from "./file-tree-model"

/**
 * Get flattened tree items (for keyboard navigation)
 */
export function getFlatTreeItems(
  fileTree: FileTreeNode[],
  files: DiffFile[]
): FlatTreeItem[] {
  return flattenTree(fileTree, files)
}

/** The rows the file tree island draws, for navigation to index into. */
export function getVisibleFlatTreeItems(
  fileTree: FileTreeNode[],
  files: DiffFile[],
  ignoredFiles: Set<string>,
  showHiddenFiles: boolean,
  treeFilter = ""
): FlatTreeItem[] {
  return visibleTreeItems(fileTree, files, ignoredFiles, showHiddenFiles, treeFilter)
}

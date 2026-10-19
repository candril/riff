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

/** The rows FileTreePanel draws, for navigation to index into. */
export function getVisibleFlatTreeItems(
  fileTree: FileTreeNode[],
  files: DiffFile[],
  ignoredFiles: Set<string>,
  showHiddenFiles: boolean,
  treeFilter = ""
): FlatTreeItem[] {
  return visibleTreeItems(fileTree, files, ignoredFiles, showHiddenFiles, treeFilter)
}

/**
 * Get a reference to the file tree scroll box for programmatic scrolling
 */
export function getFileTreeScrollBox(renderer: { root: { findDescendantById: (id: string) => unknown } }): import("@opentui/core").ScrollBoxRenderable | null {
  return renderer.root.findDescendantById("file-tree-scroll") as import("@opentui/core").ScrollBoxRenderable | null
}

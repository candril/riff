import type { DiffFile } from "../utils/diff-parser"
import type { FileTreeNode, FlatTreeItem } from "../utils/file-tree"
import { flattenTree, filterTree } from "../utils/file-tree"

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
 * Get flattened tree items filtered by ignore patterns.
 * When showHiddenFiles is false and there are ignored files,
 * this returns only visible items (matching what FileTreePanel renders).
 */
export function getVisibleFlatTreeItems(
  fileTree: FileTreeNode[],
  files: DiffFile[],
  ignoredFiles: Set<string>,
  showHiddenFiles: boolean,
  treeFilter = ""
): FlatTreeItem[] {
  let flatItems = flattenTree(filterTree(fileTree, treeFilter), files)
  if (!showHiddenFiles && ignoredFiles.size > 0) {
    // Filter out ignored file nodes
    flatItems = flatItems.filter((item) => {
      if (item.node.isDirectory) return true
      if (item.node.file && ignoredFiles.has(item.node.file.filename)) return false
      return true
    })
    // Remove directory nodes that have no visible children
    flatItems = flatItems.filter((item) => {
      if (!item.node.isDirectory) return true
      const dirPrefix = item.node.path + "/"
      return files.some((f) => f.filename.startsWith(dirPrefix) && !ignoredFiles.has(f.filename))
    })
    // Re-index
    flatItems.forEach((item, i) => {
      item.index = i
    })
  }
  return flatItems
}

/**
 * Get a reference to the file tree scroll box for programmatic scrolling
 */
export function getFileTreeScrollBox(renderer: { root: { findDescendantById: (id: string) => unknown } }): import("@opentui/core").ScrollBoxRenderable | null {
  return renderer.root.findDescendantById("file-tree-scroll") as import("@opentui/core").ScrollBoxRenderable | null
}

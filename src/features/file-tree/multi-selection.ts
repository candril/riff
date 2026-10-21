import type { AppState } from "../../state"
import type { DiffFile } from "../../utils/diff-parser"
import type { FlatTreeItem } from "../../utils/file-tree"
import { treeRowsOf } from "../../components"

/**
 * Locate the anchor row's current index in the flat item list.
 * Returns -1 if the anchor is null or the row has vanished (e.g., its parent
 * directory was collapsed). Using node.path as the key means expand/collapse
 * doesn't invalidate the anchor unless the anchor row itself disappears.
 */
function findAnchorIndex(
  anchorPath: string | null,
  flatItems: FlatTreeItem[],
): number {
  if (anchorPath === null) return -1
  return flatItems.findIndex((it) => it.node.path === anchorPath)
}

/**
 * Walk the visual-line range [anchor..highlight] in the current flat list,
 * keep only non-directory, non-ignored rows, and return the DiffFiles.
 *
 * Callers pass `flatItems` so we don't recompute it — the file-tree input
 * handler already has it in hand.
 */
export function collectMultiSelectionFiles(
  state: AppState,
  flatItems: FlatTreeItem[],
): DiffFile[] {
  const anchorIndex = findAnchorIndex(state.treeSelectionAnchor, flatItems)
  if (anchorIndex === -1) return []
  const cursorIndex = state.treeHighlightIndex
  const lo = Math.max(0, Math.min(anchorIndex, cursorIndex))
  const hi = Math.min(flatItems.length - 1, Math.max(anchorIndex, cursorIndex))

  const out: DiffFile[] = []
  for (let i = lo; i <= hi; i++) {
    const item = flatItems[i]
    if (!item?.node.file) continue
    if (state.ignoredFiles.has(item.node.file.filename)) continue
    out.push(item.node.file)
  }
  return out
}

/**
 * Return the set of filenames currently inside the tree multi-selection
 * range. Used by the renderer for background highlighting.
 */
export function getTreeMultiSelectionFilenames(state: AppState): Set<string> {
  if (state.treeSelectionAnchor === null) return new Set()
  const flatItems = treeRowsOf(state)
  const files = collectMultiSelectionFiles(state, flatItems)
  return new Set(files.map((f) => f.filename))
}

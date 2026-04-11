/**
 * Scope detection for the context-aware AI Review action.
 *
 * Called from two places:
 * - `Action.label` and `Action.available` in the registry, which only have
 *   AppState + VimCursorState (no line mapping, no DiffFile resolution).
 * - The handler, which additionally walks the tree / line mapping to extract
 *   the concrete file set or selection lines.
 *
 * The return type is deliberately minimal: just enough for the label to pick
 * the right title ("Review selection" / "Review folder" / "Review file").
 * The handler re-runs its own scope logic to get the full payload.
 */

import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffFile } from "../../utils/diff-parser"
import type { FlatTreeItem } from "../../utils/file-tree"
import { getVisibleFlatTreeItems } from "../../components"

export type ReviewScopeKind = "selection" | "multi" | "folder" | "file" | "none"

/**
 * Result of scope detection. `multi` carries a count so the palette label
 * can render "Discuss N files" without recomputing.
 */
export type ReviewScope =
  | { kind: "selection" }
  | { kind: "multi"; count: number }
  | { kind: "folder" }
  | { kind: "file" }
  | { kind: "none" }

/**
 * Detect which kind of review scope the user is "aiming at" right now.
 *
 * Priority order (first match wins):
 *   1. diff-view visual-line mode           → selection
 *   2. tree focused + tree multi-select     → multi
 *   3. tree focused + directory highlighted → folder
 *   4. tree focused + file highlighted      → file
 *   5. a file is resolvable elsewhere       → file
 *   6. otherwise                            → none
 */
export function detectReviewScope(
  state: AppState,
  vimState?: VimCursorState,
): ReviewScope {
  // 1. Diff-view visual-line takes precedence when active.
  if (vimState?.mode === "visual-line" && vimState.selectionAnchor !== null) {
    return { kind: "selection" }
  }

  // 2-4. Tree-panel scopes.
  if (state.focusedPanel === "tree") {
    const flatItems = getVisibleFlatTreeItems(
      state.fileTree,
      state.files,
      state.ignoredFiles,
      state.showHiddenFiles,
    )

    // 2. Tree multi-select: count the files inside the range (skipping dirs
    // and ignored files). If the anchor row has vanished or the range
    // contains no files, fall through to folder/file detection.
    if (state.treeSelectionAnchor !== null) {
      const files = collectMultiSelectionFiles(state, flatItems)
      if (files.length > 0) {
        return { kind: "multi", count: files.length }
      }
    }

    // 3. Folder: highlighted node is a directory.
    const highlighted = flatItems[state.treeHighlightIndex]
    if (highlighted?.node.isDirectory) {
      return { kind: "folder" }
    }
    // 4. File under the highlight.
    if (highlighted?.node.isDirectory === false) {
      return { kind: "file" }
    }
    // Nothing highlighted — fall through.
  }

  // 5a. Single-file view — a file is selected.
  if (state.selectedFileIndex !== null && state.files[state.selectedFileIndex]) {
    return { kind: "file" }
  }

  // 5b. All-files view — as long as we have any files, the cursor can land on one.
  // We don't have line mapping here, so we optimistically say "file" if there
  // are files at all. The handler will re-check and bail out with a toast if
  // the cursor turns out to be on a meta row.
  if (state.files.length > 0) {
    return { kind: "file" }
  }

  return { kind: "none" }
}

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
  const flatItems = getVisibleFlatTreeItems(
    state.fileTree,
    state.files,
    state.ignoredFiles,
    state.showHiddenFiles,
  )
  const files = collectMultiSelectionFiles(state, flatItems)
  return new Set(files.map((f) => f.filename))
}

/**
 * Collect the DiffFile entries under a directory prefix, skipping ignored
 * files. Used by the folder-scope handler.
 */
export function collectFilesUnderDirectory(
  files: DiffFile[],
  ignoredFiles: Set<string>,
  dirPath: string,
): DiffFile[] {
  const prefix = dirPath.endsWith("/") ? dirPath : dirPath + "/"
  const out: DiffFile[] = []
  for (const f of files) {
    if (!f.filename.startsWith(prefix)) continue
    if (ignoredFiles.has(f.filename)) continue
    out.push(f)
  }
  return out
}

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
import { getVisibleFlatTreeItems } from "../../components"

export type ReviewScopeKind = "selection" | "folder" | "file" | "none"

export interface ReviewScope {
  kind: ReviewScopeKind
}

/**
 * Detect which kind of review scope the user is "aiming at" right now.
 *
 * Priority order (first match wins):
 *   1. visual-line mode → selection
 *   2. focused on tree AND highlighted node is a directory → folder
 *   3. a file is resolvable from tree highlight / selected index / cursor → file
 *   4. otherwise → none
 */
export function detectReviewScope(
  state: AppState,
  vimState?: VimCursorState,
): ReviewScope {
  // 1. Selection takes precedence when active.
  if (vimState?.mode === "visual-line" && vimState.selectionAnchor !== null) {
    return { kind: "selection" }
  }

  // 2. Folder: tree focused + highlighted node is a directory.
  if (state.focusedPanel === "tree") {
    const flatItems = getVisibleFlatTreeItems(
      state.fileTree,
      state.files,
      state.ignoredFiles,
      state.showHiddenFiles,
    )
    const highlighted = flatItems[state.treeHighlightIndex]
    if (highlighted?.node.isDirectory) {
      return { kind: "folder" }
    }
    if (highlighted?.node.isDirectory === false) {
      return { kind: "file" }
    }
    // Nothing highlighted — fall through.
  }

  // 3. Single-file view — a file is selected.
  if (state.selectedFileIndex !== null && state.files[state.selectedFileIndex]) {
    return { kind: "file" }
  }

  // 4. All-files view — as long as we have any files, the cursor can land on one.
  // We don't have line mapping here, so we optimistically say "file" if there
  // are files at all. The handler will re-check and bail out with a toast if
  // the cursor turns out to be on a meta row.
  if (state.files.length > 0) {
    return { kind: "file" }
  }

  return { kind: "none" }
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

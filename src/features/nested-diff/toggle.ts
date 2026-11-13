/**
 * `gN` (spec 116): the cursor's `.diff` or `.patch` file between the diff it
 * contains and its plain diff, or a deleted file between its comparison with
 * the `.diff` that replaced it and its plain deletion. The cursor stays on
 * the line of the file it was on.
 */

import type { AppState } from "../../state"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { DiffLine, VimCursorState } from "../../vim-diff/types"
import type { DiffViewport } from "../../app/diff-viewport"
import type { ToastState } from "../toast/state"
import type { NestedDiffState } from "./state"
import { isNestedDiffFile } from "./nest"
import { findPairs } from "./pairing"

export interface ToggleNestedDeps {
  getState: () => AppState
  getMapping: () => DiffLineMapping
  getVimState: () => VimCursorState
  setVimState: (state: VimCursorState) => void
  nested: Pick<NestedDiffState, "toggle">
  rebuildLineMapping: () => void
  cursorView: Pick<DiffViewport, "onceRebuilt" | "landCursor">
  toast: Pick<ToastState, "show" | "clear" | "current">
  render: () => void
}

const TOAST_MS = 2500

export function toggleNested(deps: ToggleNestedDeps): void {
  const state = deps.getState()
  if (state.viewMode !== "diff" || state.focusedPanel !== "diff") return

  const mapping = deps.getMapping()
  const filename = cursorFilename(deps)
  if (!filename) return
  if (!isNestedDiffFile(filename) && !findPairs(state.files).has(filename)) {
    return toast(deps, "gN reads .diff and .patch files, and a file deleted for one")
  }

  const at = mapping.getLine(deps.getVimState().line)
  const anchor = at?.filename === filename ? at : undefined
  deps.nested.toggle(filename)
  deps.rebuildLineMapping()
  const line = rowFor(deps.getMapping(), filename, anchor)
  deps.setVimState({ ...deps.getVimState(), line, col: 0, desiredCol: null })
  deps.render()
  deps.cursorView.onceRebuilt(() => deps.cursorView.landCursor(line))
}

function cursorFilename(deps: ToggleNestedDeps): string | null {
  const state = deps.getState()
  if (state.selectedFileIndex !== null) return state.files[state.selectedFileIndex]?.filename ?? null
  return deps.getMapping().getLine(deps.getVimState().line)?.filename ?? null
}

/**
 * The row of the line the cursor was on. A nested file keeps its rows, so
 * this is the same row; a paired file's rows are another file's lines, so
 * its old line is the one to find, or the file's first row.
 */
function rowFor(mapping: DiffLineMapping, filename: string, anchor: DiffLine | undefined): number {
  let first: number | null = null
  for (let index = 0; index < mapping.lineCount; index++) {
    const line = mapping.getLine(index)!
    if (line.filename !== filename) continue
    first ??= index
    if (!anchor || anchor.type === "file-header") return first
    if (line.type === "file-header") continue
    const same =
      anchor.oldLineNum !== undefined
        ? line.oldLineNum === anchor.oldLineNum
        : line.newLineNum === anchor.newLineNum && line.pairedFile === anchor.pairedFile
    if (same) return index
  }
  return first ?? 0
}

function toast(deps: ToggleNestedDeps, message: string): void {
  deps.toast.show(message, "info")
  deps.render()
  setTimeout(() => {
    if (deps.toast.current()?.message !== message) return
    deps.toast.clear()
    deps.render()
  }, TOAST_MS)
}

/**
 * `gR` (spec 111): the cursor's markdown file between its diff and its
 * rendered new version. The cursor stays on the source line it was on, so
 * the switch reads as the same place drawn another way.
 */

import type { AppState } from "../../state"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffViewport } from "../../app/diff-viewport"
import type { FileContentState } from "../file-content/state"
import type { ToastState } from "../toast/state"
import type { RenderedMarkdownState } from "./state"
import { isMarkdownFile } from "./render"

export interface ToggleRenderedDeps {
  getState: () => AppState
  getMapping: () => DiffLineMapping
  getVimState: () => VimCursorState
  setVimState: (state: VimCursorState) => void
  rendered: Pick<RenderedMarkdownState, "has" | "toggle">
  fileContent: Pick<FileContentState, "entry">
  loadFileContent: (filename: string) => Promise<void> | void
  rebuildLineMapping: () => void
  cursorView: Pick<DiffViewport, "onceRebuilt" | "landCursor">
  toast: Pick<ToastState, "show" | "clear" | "current">
  render: () => void
}

const TOAST_MS = 2500

export async function toggleRendered(deps: ToggleRenderedDeps): Promise<void> {
  const state = deps.getState()
  if (state.viewMode !== "diff" || state.focusedPanel !== "diff") return

  const filename = cursorFilename(deps)
  if (!filename) return
  if (!isMarkdownFile(filename)) return toast(deps, "gR renders markdown files only")
  if (state.files.find((file) => file.filename === filename)?.status === "deleted") {
    return toast(deps, "A deleted file has no new version to render")
  }

  const anchor = cursorSourceLine(deps.getMapping(), deps.getVimState().line, filename)
  deps.rendered.toggle(filename)

  const entry = deps.fileContent.entry(filename)
  if (deps.rendered.has(filename) && entry?.newContent == null) {
    // Until the new version lands there is nothing to render, and the diff
    // stays on screen; the cursor is placed once it does.
    if (!entry?.loading) await deps.loadFileContent(filename)
    else return
  }

  deps.rebuildLineMapping()
  const line = rowForSourceLine(deps.getMapping(), filename, anchor)
  deps.setVimState({ ...deps.getVimState(), line, col: 0, desiredCol: null })
  deps.render()
  deps.cursorView.onceRebuilt(() => deps.cursorView.landCursor(line))
}

function cursorFilename(deps: ToggleRenderedDeps): string | null {
  const state = deps.getState()
  if (state.selectedFileIndex !== null) return state.files[state.selectedFileIndex]?.filename ?? null
  return deps.getMapping().getLine(deps.getVimState().line)?.filename ?? null
}

/** A row with no new line, a removal or a header, stands for the next line the new version has. */
function cursorSourceLine(mapping: DiffLineMapping, cursor: number, filename: string): number | null {
  for (let index = cursor; index < mapping.lineCount; index++) {
    const line = mapping.getLine(index)!
    if (line.filename !== filename) break
    if (line.newLineNum !== undefined) return line.newLineNum
  }
  return null
}

/**
 * The row drawn from the anchor's line, or from the next line that has one:
 * a fence has no rendered row, and a line in a collapsed run has no diff row.
 */
function rowForSourceLine(mapping: DiffLineMapping, filename: string, anchor: number | null): number {
  let first: number | null = null
  for (let index = 0; index < mapping.lineCount; index++) {
    const line = mapping.getLine(index)!
    if (line.filename !== filename) continue
    first ??= index
    if (anchor !== null && line.newLineNum !== undefined && line.newLineNum >= anchor) return index
  }
  return first ?? 0
}

function toast(deps: ToggleRenderedDeps, message: string): void {
  deps.toast.show(message, "info")
  deps.render()
  setTimeout(() => {
    if (deps.toast.current()?.message !== message) return
    deps.toast.clear()
    deps.render()
  }, TOAST_MS)
}

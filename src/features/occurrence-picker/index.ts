/**
 * Occurrence Picker Feature (spec 088)
 *
 * `Ctrl-s` lists every row of the change set that matches the query,
 * grouped by file. Selecting one puts the cursor on it, opening whatever
 * stands between the reader and the row: another view, a collapsed file,
 * the tree filter, a folded code block.
 */

import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { getCharSelection } from "../../vim-diff/cursor-state"
import { wordAt } from "../../vim-diff/search-engine"
import { showToast, switchView, toggleBlockFold } from "../../state"
import { handleSelectFile, ensureFileExpanded, type FileNavigationContext } from "../file-navigation"
import type { OccurrenceHit } from "./filter"

export { handleInput, type OccurrencePickerInputContext } from "./input"
export {
  findOccurrences,
  getOccurrenceResults,
  MAX_HITS,
  type OccurrenceHit,
  type OccurrenceGroup,
  type OccurrenceResults,
} from "./filter"
export { buildOccurrenceRows, type OccurrenceRow } from "./corpus"
export { openOccurrencePicker, closeOccurrencePicker } from "../../state"

export interface OccurrenceJumpContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  getLineMapping: () => DiffLineMapping
  ensureCursorVisible: () => void
  render: () => void
  fileNavContext: FileNavigationContext
}

/**
 * What the picker opens with: a selection on one line, else the word under
 * the cursor — `*` for the whole change set. A selection across lines seeds
 * nothing, since the picker matches one row at a time.
 */
export function seedQuery(vim: VimCursorState, mapping: DiffLineMapping): string {
  if (vim.mode === "visual") {
    const selection = getCharSelection(vim)
    if (!selection || selection.startLine !== selection.endLine) return ""
    return codeOn(mapping, selection.startLine).slice(selection.startCol, selection.endCol + 1).trim()
  }
  if (vim.mode === "visual-line") return ""
  return wordAt(codeOn(mapping, vim.line), vim.col) ?? ""
}

/** A file header or a divider is riff's chrome, not text the diff contains. */
function codeOn(mapping: DiffLineMapping, line: number): string {
  const row = mapping.getLine(line)
  if (row?.type !== "addition" && row?.type !== "deletion" && row?.type !== "context") return ""
  return row.content
}

export function jumpToOccurrence(hit: OccurrenceHit, ctx: OccurrenceJumpContext): void {
  const { row } = hit
  if (ctx.getState().viewMode !== "diff") ctx.setState((s) => switchView(s, "diff"))

  const state = ctx.getState()
  const fileIndex = state.files.findIndex((f) => f.filename === row.filename)
  if (fileIndex === -1) {
    ctx.setState((s) => showToast(s, `${row.filename} is no longer in the diff`, "error"))
    ctx.render()
    return
  }

  if (state.selectedFileIndex !== null && state.selectedFileIndex !== fileIndex) {
    handleSelectFile(fileIndex, ctx.fileNavContext)
  } else {
    ensureFileExpanded(row.filename, ctx.fileNavContext)
  }

  // The tree filter keeps a file out of the all-files mapping however far it
  // is unfolded; on its own it is always there.
  if (!fileInMapping(ctx.getLineMapping(), row.filename)) {
    handleSelectFile(fileIndex, ctx.fileNavContext)
  }

  const line = findRow(hit, ctx) ?? findRowUnderFold(hit, ctx)
  if (line === null) {
    ctx.setState((s) => showToast(s, `${row.filename}:${row.lineNum} is not on screen`, "error"))
    ctx.render()
    return
  }

  ctx.setVimState({ ...ctx.getVimState(), line, col: hit.startCol, desiredCol: null })
  ctx.ensureCursorVisible()
  ctx.render()
}

function findRow(hit: OccurrenceHit, ctx: OccurrenceJumpContext): number | null {
  const { filename, lineNum, side } = hit.row
  return ctx.getLineMapping().findLineForComment({ filename, line: lineNum, side })
}

/**
 * A folded code block is one row standing where its lines were (spec 073),
 * carrying the opening fence's line numbers — so the fold that hides the row
 * is the last one in its file that starts at or above it.
 */
function findRowUnderFold(hit: OccurrenceHit, ctx: OccurrenceJumpContext): number | null {
  const { filename, lineNum, side } = hit.row
  const mapping = ctx.getLineMapping()

  let foldId: string | null = null
  for (let i = 0; i < mapping.lineCount; i++) {
    const line = mapping.getLine(i)
    if (line?.filename !== filename || !line.blockFoldId) continue
    const fenceLine = side === "LEFT" ? line.oldLineNum : line.newLineNum
    if (fenceLine !== undefined && fenceLine <= lineNum) foldId = line.blockFoldId
  }
  if (!foldId) return null

  const id = foldId
  ctx.setState((s) => toggleBlockFold(s, id))
  ctx.fileNavContext.createLineMapping()
  return findRow(hit, ctx)
}

function fileInMapping(mapping: DiffLineMapping, filename: string): boolean {
  for (let i = 0; i < mapping.lineCount; i++) {
    if (mapping.getLine(i)?.filename === filename) return true
  }
  return false
}

import type { AppState } from "../../state"
import { showToast, clearToast, toggleBlockFold } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { FileNavigationContext } from "../file-navigation"
import { handleSelectFile, ensureFileExpanded } from "../file-navigation"
import { markAt } from "./capture"
import { resolveMark, markLandingMessage, type ResolvedMark } from "./resolve"
import { setMark, deleteMark, visitMark, flipTarget, stepMark } from "./store"
import { markSitsAt } from "./toggle"
import type { Mark } from "./types"

type Pane = "left" | "right"

export interface MarksContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  /** The unified mapping: the cursor's line is one of its rows in split too. */
  getLineMapping: () => DiffLineMapping
  /** The active split pane, or null in unified. */
  getPane: () => Pane | null
  /** Makes a pane active in split; nothing in unified. */
  setPane: (pane: Pane) => void
  ensureCursorVisible: () => void
  render: () => void
  fileNavContext: FileNavigationContext
  save: (marks: readonly Mark[]) => void
  /** The PR head the cursor's line numbers belong to; undefined in local mode. */
  getHead: () => string | undefined
}

export function setMarkAtCursor(letter: string, ctx: MarksContext): void {
  const mapping = ctx.getLineMapping()
  const cursorLine = ctx.getVimState().line
  const placed = markAt(mapping, cursorLine, letter, ctx.getPane() ?? undefined)
  if (!placed) {
    toast(ctx, `Mark ${letter} needs a file under the cursor`)
    return
  }
  const existing = ctx.getState().marks.marks.find((m) => m.letter === letter)
  if (existing && markSitsAt(mapping, existing, cursorLine, placed, ctx.getPane() !== null)) {
    ctx.setState((s) => ({ ...s, marks: deleteMark(s.marks, letter) }))
    ctx.save(ctx.getState().marks.marks)
    toast(ctx, `Mark ${letter} removed`)
    return
  }
  const head = ctx.getHead()
  // Left out rather than undefined, so marks.json carries no empty key.
  const mark: Mark = head === undefined ? placed : { ...placed, head }
  ctx.setState((s) => ({ ...s, marks: setMark(s.marks, mark) }))
  ctx.save(ctx.getState().marks.marks)
  toast(ctx, `Mark ${letter} set`)
}

/** `'{letter}`. False when there was nowhere to go and the cursor stayed. */
export function jumpToMark(letter: string, ctx: MarksContext): boolean {
  const state = ctx.getState()
  const mark = state.marks.marks.find((m) => m.letter === letter)
  if (!mark) {
    toast(ctx, `Mark ${letter} is not set`)
    return false
  }
  const fileIndex = state.files.findIndex((f) => f.filename === mark.filename)
  if (fileIndex === -1) {
    toast(ctx, markLandingMessage(mark, null)!)
    return false
  }

  if (state.selectedFileIndex !== null && state.selectedFileIndex !== fileIndex) {
    handleSelectFile(fileIndex, ctx.fileNavContext)
  } else {
    ensureFileExpanded(mark.filename, ctx.fileNavContext)
  }

  const found = findMark(mark, fileIndex, ctx)
  if (!found) {
    toast(ctx, markLandingMessage(mark, null)!)
    return false
  }
  const resolved = openFoldHiding(mark, found, ctx)

  ctx.setVimState({ ...ctx.getVimState(), line: resolved.line, col: 0, desiredCol: null })
  // A context row is in both panes, and split leaves the pane alone there,
  // so the mark's own side has to be made active.
  ctx.setPane(resolved.side === "LEFT" ? "left" : "right")
  ctx.ensureCursorVisible()
  ctx.render()

  ctx.setState((s) => ({ ...s, marks: visitMark(s.marks, letter) }))
  const message = markLandingMessage(mark, resolved.landing)
  if (message) toast(ctx, message)
  return true
}

/** `''`: back to the mark visited before the current one. */
export function flipMark(ctx: MarksContext): boolean {
  const target = flipTarget(ctx.getState().marks)
  if (target === null) {
    toast(ctx, "No earlier mark to go back to")
    return false
  }
  return jumpToMark(target, ctx)
}

/**
 * `]m` and `[m`. A mark that cannot be reached still counts as visited, so
 * the next step moves past it instead of trying it again.
 */
export function stepToMark(direction: 1 | -1, ctx: MarksContext): boolean {
  const letter = stepMark(ctx.getState().marks, direction)
  if (letter === null) {
    toast(ctx, "No marks set")
    return false
  }
  if (jumpToMark(letter, ctx)) return true
  ctx.setState((s) => ({ ...s, marks: visitMark(s.marks, letter) }))
  return false
}

/**
 * The tree filter keeps a file out of the all-files mapping however far it
 * is unfolded; on its own it is always there.
 */
function findMark(mark: Mark, fileIndex: number, ctx: MarksContext): ResolvedMark | null {
  const resolved = resolveMark(ctx.getLineMapping(), mark)
  if (resolved) return resolved
  handleSelectFile(fileIndex, ctx.fileNavContext)
  return resolveMark(ctx.getLineMapping(), mark)
}

/**
 * A folded code block is one row standing where its lines were, so a mark
 * inside it can only land nearby. The fold that could hide the line is the
 * last one in its file that opens at or above it; it is opened only if the
 * line really is inside, so a mark whose line is simply gone leaves the
 * reader's folds as they were.
 */
function openFoldHiding(mark: Mark, first: ResolvedMark, ctx: MarksContext): ResolvedMark {
  if (first.landing === "exact" || mark.line === null) return first
  const foldId = foldAbove(ctx.getLineMapping(), mark, mark.line)
  if (!foldId) return first

  ctx.setState((s) => toggleBlockFold(s, foldId))
  const opened = resolveMark(ctx.fileNavContext.createLineMapping(), mark)
  if (opened?.landing === "exact") return opened

  ctx.setState((s) => toggleBlockFold(s, foldId))
  ctx.fileNavContext.createLineMapping()
  return first
}

function foldAbove(mapping: DiffLineMapping, mark: Mark, line: number): string | null {
  let foldId: string | null = null
  for (const row of mapping.allLines) {
    if (row.filename !== mark.filename || !row.blockFoldId) continue
    const fenceLine = mark.side === "LEFT" ? row.oldLineNum : row.newLineNum
    if (fenceLine !== undefined && fenceLine <= line) foldId = row.blockFoldId
  }
  return foldId
}

function toast(ctx: MarksContext, message: string): void {
  ctx.setState((s) => showToast(s, message, "info"))
  ctx.render()
  setTimeout(() => {
    if (ctx.getState().toast.message !== message) return
    ctx.setState(clearToast)
    ctx.render()
  }, 2500)
}

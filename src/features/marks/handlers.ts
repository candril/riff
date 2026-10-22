import type { AppState } from "../../state"
import { showToast, clearToast } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { FileNavigationContext } from "../file-navigation"
import { handleSelectFile, ensureFileExpanded } from "../file-navigation"
import { markAt } from "./capture"
import { resolveMark, markLandingMessage, type ResolvedMark } from "./resolve"
import { flipTarget, stepMark } from "./store"
import { markSitsAt } from "./toggle"
import { openFoldHiding } from "./fold-hiding"
import type { GlobalMarksState } from "./state"
import type { Mark } from "./types"

type Pane = "left" | "right"

export interface MarksContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  /** The unified mapping: the cursor's line is one of its rows in split too. */
  getLineMapping: () => DiffLineMapping
  getPane: () => Pane | null
  setPane: (pane: Pane) => void
  ensureCursorVisible: () => void
  render: () => void
  fileNavContext: FileNavigationContext
  marks: Pick<GlobalMarksState, "marks" | "snapshot" | "set" | "remove" | "visit">
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
  const existing = ctx.marks.marks().find((m) => m.letter === letter)
  if (existing && markSitsAt(mapping, existing, cursorLine, placed, ctx.getPane() !== null)) {
    ctx.marks.remove(letter)
    ctx.save(ctx.marks.marks())
    toast(ctx, `Mark ${letter} removed`)
    return
  }
  const head = ctx.getHead()
  // Left out rather than undefined, so marks.json carries no empty key.
  const mark: Mark = head === undefined ? placed : { ...placed, head }
  ctx.marks.set(mark)
  ctx.save(ctx.marks.marks())
  toast(ctx, `Mark ${letter} set`)
}

/** `'{letter}`. False when there was nowhere to go and the cursor stayed. */
export function jumpToMark(letter: string, ctx: MarksContext): boolean {
  const state = ctx.getState()
  const mark = ctx.marks.marks().find((m) => m.letter === letter)
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
  const resolved = openFoldHiding(mark, found, {
    setState: ctx.setState,
    getLineMapping: ctx.getLineMapping,
    rebuildLineMapping: ctx.fileNavContext.createLineMapping,
  })

  ctx.setVimState({ ...ctx.getVimState(), line: resolved.line, col: 0, desiredCol: null })
  // A context row is in both panes, and split leaves the pane alone there,
  // so the mark's own side has to be made active.
  ctx.setPane(resolved.side === "LEFT" ? "left" : "right")
  ctx.ensureCursorVisible()
  ctx.render()

  ctx.marks.visit(letter)
  const message = markLandingMessage(mark, resolved.landing)
  if (message) toast(ctx, message)
  return true
}

/** `''`: back to the mark visited before the current one. */
export function flipMark(ctx: MarksContext): boolean {
  const target = flipTarget(ctx.marks.snapshot())
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
  const letter = stepMark(ctx.marks.snapshot(), direction)
  if (letter === null) {
    toast(ctx, "No marks set")
    return false
  }
  if (jumpToMark(letter, ctx)) return true
  ctx.marks.visit(letter)
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

function toast(ctx: MarksContext, message: string): void {
  ctx.setState((s) => showToast(s, message, "info"))
  ctx.render()
  setTimeout(() => {
    if (ctx.getState().toast.message !== message) return
    ctx.setState(clearToast)
    ctx.render()
  }, 2500)
}

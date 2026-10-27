/**
 * `%` and `gm` (spec 012): the matching bracket across the whole file.
 * resolve.ts finds the row; this wires it to the app's file text, its
 * expanded context and its cursor.
 */

import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { LineSource } from "../../vim-diff/line-source"
import type { FileParses } from "../../vim-diff/file-parses"
import type { VimCursorState } from "../../vim-diff/types"
import type { FileContentState } from "../file-content/state"
import type { ToastState } from "../toast/state"
import { createMatchingBracketResolver, type BracketResolver } from "./resolve"

export { createMatchingBracketResolver, type BracketResolver, type BracketTarget } from "./resolve"

export interface MatchingBracketContext {
  getSource: () => LineSource
  getMapping: () => DiffLineMapping
  parses: Pick<FileParses, "get">
  fileContent: Pick<FileContentState, "entry" | "expand">
  rebuildLineMapping: () => void
  getVimState: () => VimCursorState
  setVimState: (state: VimCursorState) => void
  loadFileContent: (filename: string) => void
  toast: Pick<ToastState, "show" | "clear" | "current">
  render: () => void
}

const TOAST_MS = 2500

/**
 * The app's cursor is a mapping line, and so is a selection's anchor: rows
 * opened above them push both down. The cursor is about to move anyway; the
 * anchor of a selection `%` extends has to stay on its line.
 */
export function shiftPastDivider(state: VimCursorState, divider: number, added: number): VimCursorState {
  const shift = (line: number) => (line > divider ? line + added : line)
  return {
    ...state,
    line: shift(state.line),
    selectionAnchor: state.selectionAnchor === null ? null : shift(state.selectionAnchor),
  }
}

export function matchingBracketFor(ctx: MatchingBracketContext): BracketResolver {
  return createMatchingBracketResolver({
    getSource: ctx.getSource,
    getMapping: ctx.getMapping,
    parse: (filename) => ctx.parses.get(filename),
    fileText: (filename, side) => {
      const entry = ctx.fileContent.entry(filename)
      return (side === "old" ? entry?.oldContent : entry?.newContent) ?? null
    },
    expandDivider: (dividerKey) => {
      const before = ctx.getMapping()
      const divider = before.allLines.findIndex((line) => line.dividerKey === dividerKey)
      ctx.fileContent.expand(dividerKey)
      ctx.rebuildLineMapping()
      ctx.setVimState(shiftPastDivider(ctx.getVimState(), divider, ctx.getMapping().lineCount - before.lineCount))
      ctx.render()
    },
    loadFileContent: (filename) => {
      if (!ctx.fileContent.entry(filename)?.loading) ctx.loadFileContent(filename)
    },
    toast: (message) => {
      ctx.toast.show(message, "info")
      ctx.render()
      setTimeout(() => {
        if (ctx.toast.current()?.message !== message) return
        ctx.toast.clear()
        ctx.render()
      }, TOAST_MS)
    },
  })
}

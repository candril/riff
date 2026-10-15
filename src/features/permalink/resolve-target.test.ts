import { test, expect } from "bun:test"
import { createInitialState } from "../../state"
import { createCursorState } from "../../vim-diff/cursor-state"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { VimCursorState } from "../../vim-diff/types"
import { commentScope } from "../../diff-rows/comment-scope"
import { RowLineSource } from "../../diff-rows/row-source"
import { diffFile } from "../../diff-rows/fixtures"
import { resolveTarget, type PermalinkContext } from "./handlers"

/**
 *  left         right
 *  a  1         a  1
 *  b  2         B  2
 *  c  3         C  3
 *  d  4         d  4
 */
const file = diffFile("s.ts", ["@@ -1,4 +1,4 @@", " a", "-b", "-c", "+B", "+C", " d"])
const mapping = new DiffLineMapping([file], "all")
const at = (content: string) => mapping.allLines.findIndex((line) => line.content === content)

function targetOf(vimState: VimCursorState, pane: "left" | "right" | null) {
  const rows = pane ? new RowLineSource(mapping, "split", pane) : null
  const ctx = {
    getState: () => ({ ...createInitialState([file], [], "local", "local changes"), viewMode: "diff" as const }),
    getVimState: () => vimState,
    getLineMapping: () => mapping,
    getCommentScope: () => commentScope(vimState, rows),
  } as unknown as PermalinkContext
  return resolveTarget(ctx, true)
}

const selection: VimCursorState = {
  ...createCursorState(),
  line: at("d"),
  mode: "visual-line",
  selectionAnchor: at("b"),
}

test("a selection in split's old pane links only the lines that pane shows with a new number", () => {
  expect(targetOf(selection, "left")).toEqual({ filename: "s.ts", startLine: 4, endLine: 4 })
})

test("the same selection in unified spans every new line between its ends", () => {
  expect(targetOf(selection, null)).toEqual({ filename: "s.ts", startLine: 2, endLine: 4 })
})

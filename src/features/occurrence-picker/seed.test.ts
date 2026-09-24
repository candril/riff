import { describe, expect, test } from "bun:test"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { createCursorState, enterVisualMode } from "../../vim-diff/cursor-state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffFile } from "../../utils/diff-parser"
import { seedQuery } from "./index"

const file: DiffFile = {
  filename: "a.ts",
  additions: 1,
  deletions: 0,
  status: "modified",
  content: ["@@ -1,1 +1,2 @@", " const hunk = parseHunk(line)", "+return hunk.lines"].join("\n"),
}
const mapping = new DiffLineMapping([file], "all")
const rowOf = (text: string): number => {
  for (let i = 0; i < mapping.lineCount; i++) if (mapping.getLineContent(i).includes(text)) return i
  throw new Error(`no row with ${text}`)
}

function at(line: number, col: number): VimCursorState {
  return { ...createCursorState(), line, col }
}

describe("seedQuery", () => {
  test("is the word under the cursor", () => {
    expect(seedQuery(at(rowOf("parseHunk"), 16), mapping)).toBe("parseHunk")
  })

  test("is nothing off a word", () => {
    expect(seedQuery(at(rowOf("parseHunk"), 5), mapping)).toBe("")
  })

  test("is nothing on the file header, which is not in the diff", () => {
    const header = mapping.getLine(0)!
    expect(header.type).toBe("file-header")
    expect(seedQuery(at(0, 0), mapping)).toBe("")
  })

  test("is a selection on one line, as selected", () => {
    const row = rowOf("parseHunk")
    const selecting = { ...enterVisualMode(at(row, 13), "visual"), col: 26 }
    expect(seedQuery(selecting, mapping)).toBe("parseHunk(line")
  })

  test("is nothing for a selection across lines", () => {
    const selecting = { ...enterVisualMode(at(rowOf("parseHunk"), 6), "visual"), line: rowOf("return"), col: 3 }
    expect(seedQuery(selecting, mapping)).toBe("")
  })
})

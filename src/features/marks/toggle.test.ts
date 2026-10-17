import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { DiffFile } from "../../utils/diff-parser"
import { markAt } from "./capture"
import { markSitsAt } from "./toggle"
import type { Mark } from "./types"
import { X, Y } from "../../testing/marks"

// Rows of [X, Y] in all-files mode: see src/testing/marks.ts.
const all = () => new DiffLineMapping([X, Y], "all")
const placedAt = (mapping: DiffLineMapping, row: number, pane?: "left" | "right") => markAt(mapping, row, "a", pane)!

describe("where a mark already sits", () => {
  test("on the row it lands on exactly", () => {
    const mapping = all()
    const mark = placedAt(mapping, 9)
    expect(markSitsAt(mapping, mark, 9, placedAt(mapping, 9), false)).toBe(true)
  })

  test("not on another row", () => {
    const mapping = all()
    const mark = placedAt(mapping, 9)
    expect(markSitsAt(mapping, mark, 3, placedAt(mapping, 3), false)).toBe(false)
  })

  test("not on a row it only lands near", () => {
    const mapping = all()
    const rewritten: Mark = { ...placedAt(mapping, 9), text: "since rewritten" }
    expect(markSitsAt(mapping, rewritten, 9, placedAt(mapping, 9), false)).toBe(false)

    const changed: DiffFile = {
      ...X,
      content: ["diff --git a/src/x.ts b/src/x.ts", "--- a/src/x.ts", "+++ b/src/x.ts", "@@ -1,2 +1,2 @@", " n1", " n2"].join("\n"),
    }
    const shrunk = new DiffLineMapping([changed], "all")
    const gone: Mark = { letter: "a", filename: "src/x.ts", line: 10, side: "RIGHT" }
    // Line 10 is gone, so the mark lands on new line 2, the nearest left.
    expect(markSitsAt(shrunk, gone, 2, placedAt(shrunk, 2), false)).toBe(false)
  })

  test("in split, a LEFT mark on a context row sits there for the left pane only", () => {
    const mapping = all()
    const left = placedAt(mapping, 5, "left")
    expect(markSitsAt(mapping, left, 5, placedAt(mapping, 5, "left"), true)).toBe(true)
    expect(markSitsAt(mapping, left, 5, placedAt(mapping, 5, "right"), true)).toBe(false)
  })

  test("in unified, the same LEFT mark sits on its row", () => {
    const mapping = all()
    const left = placedAt(mapping, 5, "left")
    expect(markSitsAt(mapping, left, 5, placedAt(mapping, 5), false)).toBe(true)
  })

  test("a file mark sits on its file's header row", () => {
    const mapping = all()
    const file = placedAt(mapping, 13)
    expect(file.line).toBeNull()
    expect(markSitsAt(mapping, file, 13, placedAt(mapping, 13), false)).toBe(true)
  })
})

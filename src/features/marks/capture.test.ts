import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { markAt } from "./capture"
import { X, Y, X_CONTENT, X_MIDDLE } from "./fixture"

const all = () => new DiffLineMapping([X, Y], "all")

describe("the mark a row takes", () => {
  test("a file header marks the file", () => {
    expect(markAt(all(), 0, "a")).toEqual({ letter: "a", filename: "src/x.ts", line: null, side: "RIGHT" })
  })

  test("an addition is its new line, a deletion its old one", () => {
    expect(markAt(all(), 3, "a")).toEqual({ letter: "a", filename: "src/x.ts", line: 2, side: "RIGHT" })
    expect(markAt(all(), 2, "a")).toEqual({ letter: "a", filename: "src/x.ts", line: 2, side: "LEFT" })
  })

  test("a context line takes the side of the pane it is marked in", () => {
    expect(markAt(all(), 5, "a")).toMatchObject({ line: 4, side: "RIGHT" })
    expect(markAt(all(), 5, "a", "left")).toMatchObject({ line: 3, side: "LEFT" })
    expect(markAt(all(), 5, "a", "right")).toMatchObject({ line: 4, side: "RIGHT" })
  })

  test("a row in the pane it is not drawn in keeps its own side", () => {
    expect(markAt(all(), 3, "a", "left")).toMatchObject({ line: 2, side: "RIGHT" })
  })

  test("a divider or the spacing below a file stands on the line above", () => {
    expect(markAt(all(), 6, "a")).toMatchObject({ filename: "src/x.ts", line: 4, side: "RIGHT" })
    expect(markAt(all(), 12, "a")).toMatchObject({ filename: "src/x.ts", line: 11, side: "RIGHT" })
  })

  test("a divider with nothing numbered above it in its file marks the file", () => {
    const far = { ...X, content: X.content.replace("@@ -1,3 +1,4 @@", "@@ -3,3 +3,4 @@") }
    const mapping = new DiffLineMapping([far], "all")
    expect(mapping.getLine(1)?.type).toBe("divider")
    expect(markAt(mapping, 1, "a")).toMatchObject({ line: null, side: "RIGHT" })
  })

  test("an expanded-context line, which takes no comment, still takes a mark", () => {
    const mapping = new DiffLineMapping([X, Y], "all", undefined, {
      expandedDividers: new Set([X_MIDDLE]),
      fileContents: new Map([["src/x.ts", X_CONTENT]]),
    })
    expect(mapping.getLine(6)?.expanded).toBe(true)
    expect(markAt(mapping, 6, "a")).toMatchObject({ line: 5, side: "RIGHT" })
    expect(markAt(mapping, 6, "a", "left")).toMatchObject({ line: 4, side: "LEFT" })
  })

  test("a row outside any file takes no mark", () => {
    expect(markAt(all(), 999, "a")).toBeNull()
  })

  test("single-file mode marks the same lines", () => {
    const single = new DiffLineMapping([X, Y], "single", 0)
    expect(markAt(single, 4, "a", "left")).toMatchObject({ line: 3, side: "LEFT" })
  })
})

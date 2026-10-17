import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { DiffFile } from "../../utils/diff-parser"
import { markAt } from "./capture"
import { X, Y, DOC, X_CONTENT, X_MIDDLE } from "../../testing/marks"

const all = () => new DiffLineMapping([X, Y], "all")

describe("the mark a row takes", () => {
  test("a file header marks the file", () => {
    expect(markAt(all(), 0, "a")).toEqual({ letter: "a", filename: "src/x.ts", line: null, side: "RIGHT" })
  })

  test("an addition is its new line, a deletion its old one", () => {
    expect(markAt(all(), 3, "a")).toEqual({ letter: "a", filename: "src/x.ts", line: 2, side: "RIGHT", text: "n2" })
    expect(markAt(all(), 2, "a")).toEqual({ letter: "a", filename: "src/x.ts", line: 2, side: "LEFT", text: "o2" })
  })

  test("a context line takes the side of the pane it is marked in", () => {
    expect(markAt(all(), 5, "a")).toMatchObject({ line: 4, side: "RIGHT", text: "n4" })
    expect(markAt(all(), 5, "a", "left")).toMatchObject({ line: 3, side: "LEFT", text: "n4" })
    expect(markAt(all(), 5, "a", "right")).toMatchObject({ line: 4, side: "RIGHT", text: "n4" })
  })

  test("a row in the pane it is not drawn in keeps its own side", () => {
    expect(markAt(all(), 3, "a", "left")).toMatchObject({ line: 2, side: "RIGHT", text: "n2" })
    expect(markAt(all(), 2, "a", "right")).toMatchObject({ line: 2, side: "LEFT", text: "o2" })
  })

  test("a divider or the spacing below a file stands on the line above, and takes its text", () => {
    expect(markAt(all(), 6, "a")).toMatchObject({ filename: "src/x.ts", line: 4, side: "RIGHT", text: "n4" })
    expect(markAt(all(), 12, "a")).toMatchObject({ filename: "src/x.ts", line: 11, side: "RIGHT", text: "n11" })
  })

  test("keeps the line's text untrimmed", () => {
    const indented: DiffFile = { ...Y, content: Y.content.replace("+y2", "+    y2  ") }
    expect(markAt(new DiffLineMapping([indented], "all"), 2, "a")).toMatchObject({ line: 2, text: "    y2  " })
  })

  test("an aligned markdown table row keeps the file's text, not its padded columns", () => {
    const table: DiffFile = {
      filename: "t.md",
      additions: 3,
      deletions: 0,
      status: "added",
      content: ["diff --git a/t.md b/t.md", "--- /dev/null", "+++ b/t.md", "@@ -0,0 +1,3 @@", "+| a | bb |", "+|---|---|", "+| ccc | d |"].join(
        "\n"
      ),
    }
    const mapping = new DiffLineMapping([table], "all")
    const row = mapping.getLine(1)!
    expect(row.sourceContent).toBe("| a | bb |")
    expect(row.content).not.toBe(row.sourceContent)
    expect(markAt(mapping, 1, "a")).toMatchObject({ line: 1, text: "| a | bb |" })
  })

  test("a folded fence keeps the fence's text, not the label standing for the block", () => {
    const id = new DiffLineMapping([DOC], "all").foldableBlocks[0]!.id
    const folded = new DiffLineMapping([DOC], "all", undefined, { collapsedBlocks: new Set([id]) })
    expect(folded.getLine(2)?.blockFoldId).toBe(id)
    expect(markAt(folded, 2, "a")).toMatchObject({ line: 2, text: "```mermaid" })
  })

  test("a file mark has no text", () => {
    expect(markAt(all(), 0, "a")).not.toHaveProperty("text")
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
    expect(markAt(mapping, 6, "a")).toEqual({ letter: "a", filename: "src/x.ts", line: 5, side: "RIGHT" })
    expect(markAt(mapping, 6, "a", "left")).toEqual({ letter: "a", filename: "src/x.ts", line: 4, side: "LEFT" })
  })

  test("a row outside any file takes no mark", () => {
    expect(markAt(all(), 999, "a")).toBeNull()
  })

  test("single-file mode marks the same lines", () => {
    const single = new DiffLineMapping([X, Y], "single", 0)
    expect(markAt(single, 4, "a", "left")).toMatchObject({ line: 3, side: "LEFT" })
  })
})

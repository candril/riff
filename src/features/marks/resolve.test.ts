import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { DiffFile } from "../../utils/diff-parser"
import { resolveMark, markLandingMessage } from "./resolve"
import { markAt } from "./capture"
import type { Mark } from "./types"
import { X, Y, X_CONTENT, X_MIDDLE } from "../../testing/marks"

const all = () => new DiffLineMapping([X, Y], "all")
const mark = (line: number | null, side: Mark["side"] = "RIGHT", filename = "src/x.ts"): Mark => ({
  letter: "a",
  filename,
  line,
  side,
})

describe("finding a mark again", () => {
  test("lands on its line exactly in all-files and in single-file mode", () => {
    expect(resolveMark(all(), mark(10))).toEqual({ line: 9, side: "RIGHT", landing: "exact" })
    expect(resolveMark(new DiffLineMapping([X, Y], "single", 0), mark(10))).toEqual({
      line: 8,
      side: "RIGHT",
      landing: "exact",
    })
  })

  test("a LEFT mark on a context line finds that row, not the new line of the same number", () => {
    // New line 3 is the addition on row 4; old line 3 is the context row 5.
    expect(resolveMark(all(), mark(3, "LEFT"))).toEqual({ line: 5, side: "LEFT", landing: "exact" })
  })

  test("survives the mapping being rebuilt with its file collapsed, then with a divider expanded", () => {
    const set = markAt(all(), 7, "a", "left")!
    expect(set).toMatchObject({ line: 8, side: "LEFT" })

    const collapsed = new DiffLineMapping([X, Y], "all", undefined, { collapsedFiles: new Set(["src/x.ts"]) })
    expect(resolveMark(collapsed, set)).toEqual({ line: 0, side: "LEFT", landing: "file" })

    const expanded = new DiffLineMapping([X, Y], "all", undefined, {
      expandedDividers: new Set([X_MIDDLE]),
      fileContents: new Map([["src/x.ts", X_CONTENT]]),
    })
    // The divider's one row became four, so the line sits three rows lower.
    expect(resolveMark(expanded, set)).toEqual({ line: 10, side: "LEFT", landing: "exact" })
  })

  test("a line the changed diff no longer shows lands on the nearest one on its side, the upper on a tie", () => {
    const changed: DiffFile = {
      ...X,
      content: [
        "diff --git a/src/x.ts b/src/x.ts",
        "--- a/src/x.ts",
        "+++ b/src/x.ts",
        "@@ -1,3 +1,3 @@",
        " n1",
        "-o2",
        "+n2",
        " n3",
        "@@ -6,1 +7,1 @@",
        " n7",
      ].join("\n"),
    }
    const mapping = new DiffLineMapping([changed], "single", 0)
    expect(mapping.getLine(3)?.newLineNum).toBe(3)
    expect(mapping.getLine(5)?.newLineNum).toBe(7)

    expect(resolveMark(mapping, mark(5))).toEqual({ line: 3, side: "RIGHT", landing: "nearby" })
    expect(resolveMark(mapping, mark(6))).toEqual({ line: 5, side: "RIGHT", landing: "nearby" })
  })

  test("a file mark opens the file at its header", () => {
    expect(resolveMark(all(), mark(null, "RIGHT", "src/y.ts"))).toEqual({ line: 13, side: "RIGHT", landing: "exact" })
  })

  test("a file this mapping does not show has no row", () => {
    expect(resolveMark(new DiffLineMapping([X, Y], "single", 1), mark(4))).toBeNull()
    expect(resolveMark(all(), mark(1, "RIGHT", "src/gone.ts"))).toBeNull()
  })
})

describe("what the status bar says after the jump", () => {
  test("names how far from the mark it landed", () => {
    const m = mark(42)
    expect(markLandingMessage(m, "exact")).toBeNull()
    expect(markLandingMessage(m, "nearby")).toBe("Mark a: line 42 of src/x.ts is gone — landed nearby")
    expect(markLandingMessage(m, "file")).toBe("Mark a: src/x.ts no longer shows line 42 — landed on the file")
    expect(markLandingMessage(m, null)).toBe("Mark a: src/x.ts is not in this diff")
  })
})

import { test, expect, describe } from "bun:test"
import type { DiffFile } from "../../utils/diff-parser"
import { followMarks, FOLLOW_WINDOW } from "./follow"
import type { Mark } from "./types"
import { X, X_SHIFTED, Y } from "../../testing/marks"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { markAt } from "./capture"

const mark = (line: number | null, text?: string, side: Mark["side"] = "RIGHT", filename = "src/x.ts"): Mark => ({
  letter: "a",
  filename,
  line,
  side,
  ...(text === undefined ? {} : { text }),
})

/** A file whose new side is `lines`, all of them added. */
function added(lines: string[], filename = "src/z.ts"): DiffFile {
  return {
    filename,
    additions: lines.length,
    deletions: 0,
    status: "added",
    content: [
      `diff --git a/${filename} b/${filename}`,
      "--- /dev/null",
      `+++ b/${filename}`,
      `@@ -0,0 +1,${lines.length} @@`,
      ...lines.map((l) => `+${l}`),
    ].join("\n"),
  }
}

describe("following a mark into a changed diff", () => {
  test("a line pushed down by lines inserted above moves to its new number and takes the new head", () => {
    const set = { ...mark(10, "n10"), head: "old" }
    expect(followMarks([set], [X_SHIFTED, Y], "new")).toEqual({
      marks: [{ ...set, line: 12, head: "new" }],
      moved: true,
    })
  })

  test("a move without a head keeps the head it had", () => {
    const set = { ...mark(10, "n10"), head: "old" }
    expect(followMarks([set], [X_SHIFTED], undefined).marks).toEqual([{ ...set, line: 12 }])
  })

  test("the same text at the old number is no move", () => {
    const set = mark(10, "n10")
    const result = followMarks([set], [X, Y], "new")
    expect(result.moved).toBe(false)
    expect(result.marks[0]).toBe(set)
  })

  test("text that is gone leaves the mark as it was", () => {
    const set = mark(10, "deleted since")
    expect(followMarks([set], [X_SHIFTED], "new")).toEqual({ marks: [set], moved: false })
  })

  test("repeated text goes to the nearest occurrence, the upper one at equal distance", () => {
    const file = added(["}", "a", "b", "}", "c", "d", "}", "e", "}"])
    // From 5: the braces at 4 and 7 are 1 and 2 away.
    expect(followMarks([mark(5, "}", "RIGHT", "src/z.ts")], [file], undefined).marks[0]!.line).toBe(4)
    // From 8: the braces at 7 and 9 are both 1 away.
    expect(followMarks([mark(8, "}", "RIGHT", "src/z.ts")], [file], undefined).marks[0]!.line).toBe(7)
  })

  test("a LEFT mark follows the old numbering", () => {
    // Old line 9 is `o9`; in a diff with one more old line above, it is 10.
    const moreOld: DiffFile = {
      ...X,
      content: X.content.replace("@@ -1,3 +1,4 @@\n n1", "@@ -1,4 +1,5 @@\n q0\n n1").replace("@@ -8,3", "@@ -9,3"),
    }
    expect(followMarks([mark(9, "o9", "LEFT")], [moreOld], undefined).marks[0]).toMatchObject({ line: 10, side: "LEFT" })
    // A deleted line is on the old side only, so the new side never has it.
    expect(followMarks([mark(9, "o9", "RIGHT")], [moreOld], undefined).moved).toBe(false)
  })

  test("a match further than the window is not taken", () => {
    const far = added([...Array.from({ length: FOLLOW_WINDOW + 1 }, (_, i) => `filler ${i}`), "target"])
    const near = added([...Array.from({ length: FOLLOW_WINDOW }, (_, i) => `filler ${i}`), "target"])
    expect(followMarks([mark(1, "target", "RIGHT", "src/z.ts")], [far], undefined).moved).toBe(false)
    expect(followMarks([mark(1, "target", "RIGHT", "src/z.ts")], [near], undefined).marks[0]!.line).toBe(FOLLOW_WINDOW + 1)
  })

  test("a renamed file carries its line marks and its file marks", () => {
    const renamed: DiffFile = { ...X_SHIFTED, filename: "src/renamed.ts", oldFilename: "src/x.ts", status: "renamed" }
    const line = mark(10, "n10")
    const file = { ...mark(null), letter: "b" }
    expect(followMarks([line, file], [renamed], "new")).toEqual({
      marks: [
        { ...line, filename: "src/renamed.ts", line: 12, head: "new" },
        { ...file, filename: "src/renamed.ts" },
      ],
      moved: true,
    })
  })

  test("a mark without text is left alone", () => {
    const set = mark(10)
    expect(followMarks([set], [X_SHIFTED], "new")).toEqual({ marks: [set], moved: false })
  })

  test("a mark whose file is not in the diff is kept", () => {
    const set = mark(3, "n3", "RIGHT", "src/elsewhere.ts")
    expect(followMarks([set], [X_SHIFTED], "new")).toEqual({ marks: [set], moved: false })
  })

  test("a mark set on expanded context stays put though a nearby hunk reads the same", () => {
    // New line 4 (in the first hunk) and new line 6 (expanded only) are both `}`.
    const file: DiffFile = {
      filename: "src/w.ts",
      additions: 2,
      deletions: 2,
      status: "modified",
      content: [
        "diff --git a/src/w.ts b/src/w.ts",
        "--- a/src/w.ts",
        "+++ b/src/w.ts",
        "@@ -1,4 +1,4 @@",
        " a",
        "-B",
        "+b",
        " c",
        " }",
        "@@ -9,2 +9,2 @@",
        "-I",
        "+i",
        " j",
      ].join("\n"),
    }
    const mapping = new DiffLineMapping([file], "all", undefined, {
      expandedDividers: new Set(["src/w.ts:middle:0"]),
      fileContents: new Map([["src/w.ts", ["a", "b", "c", "}", "e", "}", "g", "h", "i", "j"].join("\n")]]),
    })
    const row = Array.from({ length: mapping.lineCount }, (_, i) => i).find((i) => mapping.getLine(i)?.newLineNum === 6)!
    expect(mapping.getLine(row)?.expanded).toBe(true)
    const set = markAt(mapping, row, "a")!
    expect(set).toMatchObject({ line: 6, side: "RIGHT" })

    expect(followMarks([set], [file], "same-head")).toEqual({ marks: [set], moved: false })
  })

  test("keeps the marks in their order", () => {
    const a = mark(10, "n10")
    const b = { ...mark(1, "y1", "RIGHT", "src/y.ts"), letter: "b" }
    expect(followMarks([b, a], [X_SHIFTED, Y], undefined).marks.map((m) => m.letter)).toEqual(["b", "a"])
  })
})

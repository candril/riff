import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "./line-mapping"
import type { DiffFile } from "../utils/diff-parser"

/**
 * Two lines are added at the top, so everything below the first hunk sits two
 * lines lower in the new file than in the old one. The run between the hunks
 * is untouched text, and expanding it has to keep that offset.
 */
const shifted: DiffFile = {
  filename: "shifted.cs",
  additions: 3,
  deletions: 0,
  status: "modified",
  content: [
    "diff --git a/shifted.cs b/shifted.cs",
    "--- a/shifted.cs",
    "+++ b/shifted.cs",
    "@@ -1,2 +1,4 @@",
    " one",
    "+two",
    "+three",
    " four",
    "@@ -6,2 +8,3 @@",
    " nine",
    "+ten",
    " eleven",
  ].join("\n"),
}

const newFile = ["one", "two", "three", "four", "five", "six", "seven", "nine", "ten", "eleven"]

function mapping(expanded: string[]) {
  return new DiffLineMapping([shifted], "all", undefined, {
    expandedDividers: new Set(expanded),
    fileContents: new Map([[shifted.filename, newFile.join("\n")]]),
  })
}

describe("expanding the run between two hunks", () => {
  test("numbers the old side by the shift the hunks carry", () => {
    const folded = mapping([])
    const divider = folded.allLines.find((line) => line.type === "divider")!
    const rows = mapping([divider.dividerKey!]).allLines

    const five = rows.find((line) => line.content === "five")!
    expect(five.newLineNum).toBe(5)
    expect(five.oldLineNum).toBe(3)

    const seven = rows.find((line) => line.content === "seven")!
    expect(seven.newLineNum).toBe(7)
    expect(seven.oldLineNum).toBe(5)
  })

  test("leaves the old side alone where the file has no line for it", () => {
    const rows = new DiffLineMapping([shifted], "all", undefined, {
      expandedDividers: new Set(["shifted.cs:start:0"]),
      fileContents: new Map([[shifted.filename, newFile.join("\n")]]),
    }).allLines

    for (const row of rows) {
      if (row.oldLineNum !== undefined) expect(row.oldLineNum).toBeGreaterThan(0)
    }
  })
})

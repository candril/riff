import { describe, expect, test } from "bun:test"
import { cellsOf } from "../diff-rows/cells"
import type { BlameLine } from "../providers/blame/types"
import type { DiffLine } from "../vim-diff/types"
import { BLAME_CELLS, blameColumnCells, blameSideFor, type BlamePick } from "./blame-column-model"

const row = (type: DiffLine["type"], extra: Partial<DiffLine> = {}): DiffLine => ({
  visualIndex: 0,
  type,
  content: "",
  rawLine: "",
  filename: "a.ts",
  ...extra,
})
const commit = (sha: string, author = "Ada Lovelace"): BlameLine => ({
  kind: "commit",
  commit: { sha: `${sha}${"0".repeat(32)}`, shortSha: sha, author, date: "2026-01-01T00:00:00Z", subject: "s" },
})
const A = commit("aaaaaaaa")
const B = commit("bbbbbbbb", "Grace")

/** Blames rows by their content, so a test reads as a column of names. */
const byContent = (answers: Record<string, BlamePick>) => (line: DiffLine) => answers[line.content]
const trimmed = (cells: string[]) => cells.map((cell) => cell.trimEnd())

describe("blameColumnCells", () => {
  test("every cell is BLAME_CELLS wide, and a run of one commit is named once", () => {
    const lines = ["1", "2", "3", "4"].map((content) => row("context", { content }))
    const cells = blameColumnCells(lines, byContent({ 1: A, 2: A, 3: B, 4: A }))
    expect(cells.every((cell) => cell.length === BLAME_CELLS)).toBe(true)
    expect(trimmed(cells)).toEqual(["aaaaaaaa Ada Love", "", "bbbbbbbb Grace", "aaaaaaaa Ada Love"])
  })

  test("a row that is not code ends the run, so each hunk names its first commit again", () => {
    const lines = [
      row("file-header"),
      row("context", { content: "1" }),
      row("divider"),
      row("context", { content: "2" }),
      row("context", { content: "3", blockFoldId: "f" }),
      row("context", { content: "4" }),
    ]
    expect(trimmed(blameColumnCells(lines, byContent({ 1: A, 2: A, 3: A, 4: A })))).toEqual([
      "",
      "aaaaaaaa Ada Love",
      "",
      "aaaaaaaa Ada Love",
      "",
      "aaaaaaaa Ada Love",
    ])
  })

  test("uncommitted lines say so once per run, and a line with no answer is blank", () => {
    const lines = ["1", "2", "3", "4"].map((content) => row("addition", { content }))
    const uncommitted: BlameLine = { kind: "uncommitted" }
    expect(trimmed(blameColumnCells(lines, byContent({ 1: uncommitted, 2: uncommitted, 4: uncommitted })))).toEqual([
      "uncommitted",
      "",
      "",
      "uncommitted",
    ])
  })

  test("a file still loading shows … once, at the top of its lines", () => {
    const lines = [row("context", { content: "1" }), row("divider"), row("context", { content: "2" })]
    expect(trimmed(blameColumnCells(lines, () => "loading"))).toEqual(["…", "", ""])
  })

  test("a wide author is cut by cells, never past the column", () => {
    const [cell] = blameColumnCells([row("context")], () => commit("cccccccc", "漢字漢字漢字"))
    expect(cell).toBe("cccccccc 漢字漢字 ")
    expect(cellsOf(cell!)).toBe(BLAME_CELLS)
  })
})

describe("blameSideFor", () => {
  const deletion = row("deletion", { oldLineNum: 4 })
  const context = row("context", { oldLineNum: 4, newLineNum: 6 })

  test("unified blames a deletion in the base and any other line in the head", () => {
    expect(blameSideFor("unified", null, deletion)).toEqual({ side: "base", line: 4 })
    expect(blameSideFor("unified", null, context)).toEqual({ side: "head", line: 6 })
  })

  test("split blames the left half in the base and the right half in the head", () => {
    expect(blameSideFor("split", "left", context)).toEqual({ side: "base", line: 4 })
    expect(blameSideFor("split", "right", context)).toEqual({ side: "head", line: 6 })
    expect(blameSideFor("split", "right", deletion)).toBeNull()
  })
})

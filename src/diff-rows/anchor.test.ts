import { test, expect, describe } from "bun:test"
import { anchorOf, findAnchor } from "./anchor"
import { buildRows, lineOf, type Side, type View } from "./rows"
import { code, doc, fenceId, mappingOf, middleDivider } from "./fixtures"
import type { DiffLine } from "../vim-diff/types"

type At = string | number

function rowAt(lines: readonly DiffLine[], view: View, at: At, side: Side) {
  const rows = buildRows(lines, view)
  const rowIndex = rows.findIndex((row) => {
    const index = lineOf(row, side)!
    return typeof at === "number" ? index === at : lines[index]!.content === at
  })
  expect(rowIndex).toBeGreaterThanOrEqual(0)
  return { rows, rowIndex }
}

function anchorAt(lines: readonly DiffLine[], view: View, at: At, side: Side) {
  const { rows, rowIndex } = rowAt(lines, view, at, side)
  return anchorOf(rows, lines, rowIndex, side)!
}

function landing(lines: readonly DiffLine[], view: View, at: At, side: Side) {
  const rows = buildRows(lines, view)
  const rowIndex = findAnchor(rows, lines, anchorAt(lines, view === "split" ? "unified" : "split", at, side))
  return lineOf(rows[rowIndex], side)
}

describe("findAnchor across the toggle", () => {
  const lines = mappingOf().allLines
  const cases: Array<[string, number, Side]> = [
    ["a context line", lines.findIndex((line) => line.content === "intro"), "right"],
    ["a removal", lines.findIndex((line) => line.content === "tail old"), "left"],
    ["an addition", lines.findIndex((line) => line.content === "tail changed"), "right"],
    ["the marker after a removal", lines.findIndex((line, i) => line.type === "no-newline" && lines[i - 1]?.type === "deletion"), "left"],
    ["the marker after an addition", lines.findIndex((line, i) => line.type === "no-newline" && lines[i - 1]?.type === "addition"), "right"],
  ]
  for (const [what, index, side] of cases) {
    test(`${what} lands on itself going to split and back`, () => {
      expect(index).toBeGreaterThanOrEqual(0)
      expect(landing(lines, "split", index, side)).toBe(index)
      expect(landing(lines, "unified", index, side)).toBe(index)
    })
  }
})

describe("findAnchor across folds and expansion", () => {
  function moved(content: string, side: Side, after: readonly DiffLine[], view: View = "unified") {
    const anchor = anchorAt(mappingOf().allLines, view, content, side)
    const rows = buildRows(after, view)
    return after[lineOf(rows[findAnchor(rows, after, anchor)], side)!]!
  }

  test("collapsing the anchor's file lands on its header", () => {
    const line = moved("three", "right", mappingOf({ collapsedFiles: new Set([code.filename]) }).allLines)
    expect(line).toMatchObject({ type: "file-header", filename: code.filename })
  })

  for (const view of ["unified", "split"] as const) {
    test(`folding the block around the anchor lands on the fold in ${view} view`, () => {
      const line = moved("const b = 2", "right", mappingOf({ collapsedBlocks: new Set([fenceId()]) }).allLines, view)
      expect(line.blockFoldId).toBe(fenceId())
    })
  }

  test("expanding a divider above the anchor keeps it on its line", () => {
    const line = moved("tail changed", "right", mappingOf({ expandedDividers: new Set([middleDivider]) }).allLines)
    expect(line).toMatchObject({ content: "tail changed", newLineNum: 10 })
  })

  test("collapsing the file above the anchor keeps it on its line", () => {
    const line = moved("TWO", "right", mappingOf({ collapsedFiles: new Set([doc.filename]) }).allLines)
    expect(line).toMatchObject({ content: "TWO", filename: code.filename })
  })

  test("an anchor nothing matches lands on the top row, and on -1 with no rows", () => {
    const anchor = { key: "gone", lineKey: "gone", filename: "gone.ts", side: "right" as const, newLine: 3 }
    const lines = mappingOf().allLines
    expect(findAnchor(buildRows(lines, "split"), lines, anchor)).toBe(0)
    expect(findAnchor([], [], anchor)).toBe(-1)
  })
})

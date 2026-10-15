import { test, expect, describe } from "bun:test"
import { buildRows, halvesOf, lineOf, rowIndexByLine, type Row, type View } from "./rows"
import { fenceId, mappingOf, middleDivider } from "./fixtures"

const views: View[] = ["unified", "split"]

function busyMapping() {
  return mappingOf({
    expandedDividers: new Set([middleDivider]),
    collapsedBlocks: new Set([fenceId()]),
  })
}

const keyOfContent = (rows: Row[], lines: ReturnType<typeof mappingOf>["allLines"], content: string) =>
  rows.find((row) => lines[lineOf(row, "right")!]!.content === content)!.key

describe("buildRows", () => {
  test("unified rows are the mapping's lines one to one", () => {
    const lines = mappingOf().allLines
    const rows = buildRows(lines, "unified")
    expect(rows.length).toBe(lines.length)
    rows.forEach((row, index) => expect(row).toMatchObject({ kind: "line", index }))
  })

  test("split rows show every line of a two-file diff exactly once", () => {
    const lines = mappingOf().allLines
    const shown = buildRows(lines, "split").flatMap(halvesOf).sort((a, b) => a - b)
    expect(shown).toEqual(lines.map((_, index) => index))
  })

  for (const view of views) {
    test(`keys are unique in ${view} view through expansion, a fold and both missing newlines`, () => {
      const lines = busyMapping().allLines
      expect(lines.some((line) => line.blockFoldId)).toBe(true)
      expect(lines.some((line) => line.expanded)).toBe(true)
      const keys = buildRows(lines, view).map((row) => row.key)
      expect(new Set(keys).size).toBe(keys.length)
    })
  }

  test("a context line keeps its key across the toggle", () => {
    const lines = mappingOf().allLines
    expect(keyOfContent(buildRows(lines, "split"), lines, "intro")).toBe(
      keyOfContent(buildRows(lines, "unified"), lines, "intro"),
    )
  })

  for (const view of views) {
    test(`expanding a divider leaves the ${view} keys below it alone`, () => {
      const before = mappingOf().allLines
      const after = mappingOf({ expandedDividers: new Set([middleDivider]) }).allLines
      const keysFrom = (lines: typeof before) => {
        const rows = buildRows(lines, view)
        const first = rows.findIndex((row) => lines[lineOf(row, "left")!]!.content === "tail old")
        return rows.slice(first).map((row) => row.key)
      }
      expect(keysFrom(after)).toEqual(keysFrom(before))
    })
  }
})

describe("lineOf", () => {
  test("an empty half gives the other half's line", () => {
    const rightOnly: Row = { kind: "pair", key: "k", right: 4 }
    const leftOnly: Row = { kind: "pair", key: "k", left: 2 }
    expect(lineOf(rightOnly, "left")).toBe(4)
    expect(lineOf(leftOnly, "right")).toBe(2)
    expect(lineOf({ kind: "line", key: "k", index: 7 }, "left")).toBe(7)
    expect(lineOf(undefined, "right")).toBeUndefined()
  })
})

describe("rowIndexByLine", () => {
  test("both halves of a pair point at that pair's row", () => {
    const lines = mappingOf().allLines
    const rows = buildRows(lines, "split")
    const byLine = rowIndexByLine(rows, lines.length)
    const pairIndex = rows.findIndex(
      (row) => row.kind === "pair" && row.left !== undefined && row.right !== undefined && row.left !== row.right,
    )
    const pair = rows[pairIndex] as Extract<Row, { kind: "pair" }>
    expect(byLine[pair.left!]).toBe(pairIndex)
    expect(byLine[pair.right!]).toBe(pairIndex)
    expect([...byLine].every((rowIndex) => rowIndex >= 0)).toBe(true)
  })
})

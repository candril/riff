import { test, expect, describe } from "bun:test"
import { renderMarkdownTable, cellLines, type TableModel } from "./markdown-table-render"

function table(rows: string[][], header = ["A", "B"]): TableModel {
  return { header, rows, alignments: header.map(() => "default") }
}

/** The text of a rendered row, borders and padding stripped. */
function cells(line: string): string[] {
  return line.slice(1, -1).split("│").map((cell) => cell.trim())
}

describe("renderMarkdownTable", () => {
  test("wraps a cell instead of cutting it", () => {
    const lines = renderMarkdownTable(table([["short", "one two three four five six"]]), 34)
    const body = lines.filter((line) => line.startsWith("│"))

    // Every word survives, across as many rows as the cell needs.
    expect(body.map((line) => cells(line)[1]).join(" ")).toContain("six")
    expect(body.length).toBeGreaterThan(2)
  })

  test("grows the row to its tallest cell and pads the others", () => {
    const lines = renderMarkdownTable(table([["a", "one two three four five six seven"]]), 32)
    const rows = lines.filter((line) => line.startsWith("│")).slice(1)

    expect(rows.length).toBeGreaterThan(1)
    // Same width on every line, so the columns stay columns.
    expect(new Set(rows.map((line) => line.length)).size).toBe(1)
  })

  test("keeps every line the same width", () => {
    const lines = renderMarkdownTable(table([["a", "b"], ["ccc", "ddd"]]), 40)
    expect(new Set(lines.map((line) => line.length)).size).toBe(1)
  })

  test("fits the width it is given", () => {
    for (const width of [30, 60, 120]) {
      const lines = renderMarkdownTable(
        table([["a fairly long first cell here", "and a second one just as long"]]),
        width
      )
      expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(width)
    }
  })

  test("draws a rule between rows, since a row is more than one line", () => {
    const lines = renderMarkdownTable(table([["a", "b"], ["c", "d"]]), 40)
    expect(lines.filter((line) => line.startsWith("├")).length).toBe(2)
  })

  test("returns nothing for a table with no columns", () => {
    expect(renderMarkdownTable({ header: [], rows: [], alignments: [] }, 40)).toEqual([])
  })
})

describe("cellLines", () => {
  test("turns a list into bullets, one per line", () => {
    expect(cellLines("<ul><li>first</li><li>second</li></ul>")).toEqual(["• first", "• second"])
  })

  test("breaks on <br>", () => {
    expect(cellLines("one<br>two")).toEqual(["one", "two"])
  })

  test("drops emphasis markers nothing can render", () => {
    expect(cellLines("**bold** and `code`")).toEqual(["bold and code"])
  })

  test("leaves plain text alone", () => {
    expect(cellLines("just words")).toEqual(["just words"])
  })
})

import { test, expect, describe } from "bun:test"
import { tablePeekModel } from "./table-peek-model"

const screen = { terminalWidth: 100, terminalHeight: 30 }

describe("the table peek", () => {
  const lines = ["+----+", "| a  |", "+----+"]

  test("is at least 20 inside, and says which side when Tab has another", () => {
    const model = tablePeekModel({ lines, rowCount: 1, side: "old", hasOther: true, scroll: { row: 0, col: 0 }, ...screen })
    expect(model.width).toBe(24)
    expect(model.header).toEqual([
      { text: "table", tone: "primary" },
      { text: "before the change", tone: "peach" },
      { text: "1 rows", tone: "dim" },
    ])
    expect(model.body).toEqual({ kind: "rows", rows: lines.map((text) => ({ text, tone: "text" })) })
    expect(model.footer).toBe("Tab: current version · gl or Esc to close")
  })

  test("with nothing to switch to, names no side; too big, says where the window is", () => {
    const big = Array.from({ length: 50 }, () => "x".repeat(200))
    const model = tablePeekModel({ lines: big, rowCount: 49, side: "new", hasOther: false, scroll: { row: 0, col: 0 }, ...screen })
    expect(model.width).toBe(96)
    expect(model.header).toEqual([
      { text: "table", tone: "primary" },
      { text: "49 rows", tone: "dim" },
      { text: "· rows 1–24 of 50, columns 1–92 of 200", tone: "yellow" },
    ])
    expect(model.footer).toBe("Press gl or Esc to close")
  })
})

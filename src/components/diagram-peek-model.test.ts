import { test, expect, describe } from "bun:test"
import { diagramPeekModel } from "./diagram-peek-model"

const screen = { terminalWidth: 100, terminalHeight: 30 }

describe("the diagram peek", () => {
  const base = { source: ["graph TD", "A-->B"], side: "new" as const, scroll: { row: 0, col: 0 }, ...screen }

  test("titles a flowchart mermaid, is at least 24 inside, and carries the note", () => {
    const model = diagramPeekModel({ ...base, lines: ["A ──> B"], kind: "flowchart", hasOther: false, note: "2 nodes" })
    expect(model.width).toBe(28)
    expect(model.header).toEqual([
      { text: "mermaid", tone: "primary" },
      { text: "as changed", tone: "green" },
      { text: "· 2 nodes", tone: "dim" },
    ])
    expect(model.footer).toBe("gl or Esc to close")
  })

  test("with nothing drawn, shows the source and says so", () => {
    const model = diagramPeekModel({ ...base, lines: [], kind: "er", hasOther: true })
    expect(model.header.map((segment) => segment.text)).toEqual(["entities", "as changed", "· source"])
    expect(model.body).toEqual({ kind: "rows", rows: base.source.map((text) => ({ text, tone: "text" })) })
    expect(model.footer).toBe("Tab: previous version · gl or Esc to close")
  })

  test("offers hjkl only when the drawing does not fit", () => {
    const model = diagramPeekModel({ ...base, lines: ["x".repeat(150)], kind: "state", hasOther: false })
    expect(model.header.at(-1)).toEqual({ text: "· columns 1–92 of 150", tone: "yellow" })
    expect(model.footer).toBe("hjkl to scroll · gl or Esc to close")
  })
})

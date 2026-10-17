import { test, expect, describe } from "bun:test"
import { viewport, linePeekModel, tablePeekModel, diagramPeekModel, hunkPeekModel } from "./peek-model"

const drawing = Array.from({ length: 40 }, (_, i) => `row ${String(i + 1).padStart(2, "0")} ${"─".repeat(60)}`)

describe("a window onto a drawing that does not fit", () => {
  test("shows what fits from the top, and says where it is", () => {
    const view = viewport(drawing, { row: 0, col: 0 }, 10, 30)
    expect(view.lines.length).toBe(10)
    expect(view.lines[0]).toBe(drawing[0]!.slice(0, 30))
    expect(view.where).toBe("rows 1–10 of 40, columns 1–30 of 67")
    expect(view.scrollable).toBe(true)
  })

  test("scrolls, and stops at the drawing's edge rather than past it", () => {
    const view = viewport(drawing, { row: 999, col: 999 }, 10, 30)
    expect(view.lines[0]).toBe(drawing[30]!.slice(37, 67))
    expect(view.where).toBe("rows 31–40 of 40, columns 38–67 of 67")
  })

  test("a drawing that fits has nothing to say and nothing to scroll", () => {
    const view = viewport(drawing.slice(0, 3), { row: 5, col: 5 }, 10, 100)
    expect(view.lines.length).toBe(3)
    expect(view.where).toBe("")
    expect(view.scrollable).toBe(false)
  })
})

const screen = { terminalWidth: 100, terminalHeight: 30 }

describe("the line peek", () => {
  test("is 92 wide on a 100-column screen, the line laid out in the 88 inside the padding", () => {
    const model = linePeekModel({ content: "const x = 1", lineNumber: 4, filetype: "typescript", ...screen })
    expect(model).toEqual({
      id: "line-peek",
      width: 92,
      header: [
        { text: "line 4", tone: "primary" },
        { text: "11 cols", tone: "dim" },
      ],
      body: { kind: "code", content: "const x = 1", filetype: "typescript", width: 88 },
      footer: "Press gl or Esc to close",
    })
  })

  test("without a number or a filetype leaves both out", () => {
    const model = linePeekModel({ content: "x", terminalWidth: 300, terminalHeight: 30 })
    expect(model.width).toBe(120)
    expect(model.header[0]).toEqual({ text: "line", tone: "primary" })
    expect(Object.keys(model.body)).toEqual(["kind", "content", "width"])
  })

  test("cuts a line past twenty rows of the box, ellipsis included", () => {
    const content = "a".repeat(5000)
    const model = linePeekModel({ content, ...screen })
    expect(model.body.kind === "code" && model.body.content).toBe("a".repeat(88 * 20 - 1) + "…")
    expect(model.header[1]).toEqual({ text: "5000 cols", tone: "dim" })
  })

  test("on a short screen, cuts to the rows the screen has left after the chrome", () => {
    const model = linePeekModel({ content: "a".repeat(5000), terminalWidth: 100, terminalHeight: 9 })
    expect(model.body.kind === "code" && model.body.content.length).toBe(88 * 3)
  })
})

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

describe("the hunk peek", () => {
  const base = { filename: "src/a/b.ts", line: 9, outdated: false, fromRoot: false, ...screen }

  test("colours each row by its marker and blanks an empty row to a space", () => {
    const model = hunkPeekModel({ ...base, hunk: "@@ -1 +1 @@\n ctx\n\n-old\n+new\n\n" })
    expect(model.body).toEqual({
      kind: "rows",
      rows: [
        { text: "@@ -1 +1 @@", tone: "blue" },
        { text: " ctx", tone: "text" },
        { text: " ", tone: "text" },
        { text: "-old", tone: "red" },
        { text: "+new", tone: "green" },
      ],
    })
    expect(model.header).toEqual([
      { text: "b.ts:9", tone: "primary" },
      { text: "the code this was written against", tone: "dim" },
    ])
    expect(model.width).toBe(40 + 4)
    expect(model.footer).toBe("c or Esc to close")
  })

  test("an outdated thread from the root is peach and says where the hunk came from", () => {
    const model = hunkPeekModel({ ...base, hunk: "+x", outdated: true, fromRoot: true })
    expect(model.header).toEqual([
      { text: "b.ts:9", tone: "primary" },
      { text: "as it was when this was written", tone: "peach" },
      { text: "· from the thread's first comment", tone: "dim" },
    ])
    expect(model.width).toBe("b.ts:9 as it was when this was written · from the thread's first comment".length + 4)
  })

  test("keeps the tail of a hunk taller than the room, and cuts wide rows", () => {
    const hunk = Array.from({ length: 40 }, (_, i) => `+${i}`).join("\n") + `\n+${"w".repeat(200)}`
    const model = hunkPeekModel({ ...base, hunk })
    if (model.body.kind !== "rows") throw new Error("rows expected")
    expect(model.body.rows).toHaveLength(24)
    expect(model.body.rows[0]).toEqual({ text: "…", tone: "text" })
    expect(model.body.rows[1]!.text).toBe("+18")
    expect(model.body.rows[23]!.text).toBe("+" + "w".repeat(90) + "…")
    expect(model.width).toBe(96)
  })
})

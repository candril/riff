import { test, expect, describe } from "bun:test"
import { linePeekModel } from "./line-peek-model"

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

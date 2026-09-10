import { test, expect, describe } from "bun:test"
import { viewport } from "./DiagramPeek"

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

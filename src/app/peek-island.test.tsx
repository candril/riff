import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createPeekIsland } from "./peek-island"
import { linePeekModel, tablePeekModel } from "../components/peek-model"
import { bgAt, findText } from "../testing/frame"

let setup: TestRendererSetup | null = null

afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

async function rows() {
  await setup!.renderOnce()
  await setup!.renderOnce()
  return setup!.captureCharFrame().split("\n")
}

/** A full-screen parent, as render.ts's root box is, for the absolute host to sit in. */
function mount(host: BoxRenderable) {
  const parent = new BoxRenderable(setup!.renderer, { width: "100%", height: "100%" })
  setup!.renderer.root.add(parent)
  parent.add(host)
}

const lines = Array.from({ length: 40 }, (_, i) => `row ${String(i + 1).padStart(2, "0")}`.padEnd(40, "."))
const model = (row: number) =>
  tablePeekModel({ lines, rowCount: 40, side: "new", hasOther: false, scroll: { row, col: 0 }, terminalWidth: 80, terminalHeight: 24 })

test("a peek shows on a model, scrolls in place on the next one, and clears on null", async () => {
  setup = await createTestRenderer({ width: 80, height: 24 })
  const island = createPeekIsland(setup.renderer, { id: "diff-peek" })
  mount(island.host)

  let screen = await rows()
  expect(screen.join("").trim()).toBe("")
  const empty = setup.captureSpans()

  island.update(model(0))
  screen = await rows()
  // 18 rows of table in a 24-row box on a 24-row screen, 44 cells wide.
  expect(screen[1]!.trimEnd()).toBe(" ".repeat(20) + "table 40 rows · rows 1–18 of 40")
  expect(screen[3]!.trimEnd()).toBe(" ".repeat(20) + "row 01".padEnd(40, "."))
  expect(screen[22]!.trimEnd()).toBe(" ".repeat(20) + "Press gl or Esc to close")
  expect(bgAt(setup.captureSpans(), 0, 0)).not.toEqual(bgAt(empty, 0, 0))
  const title = findText(island.host, "table")
  expect(title).toBeDefined()

  island.update(model(5))
  screen = await rows()
  expect(screen[1]!.trimEnd()).toBe(" ".repeat(20) + "table 40 rows · rows 6–23 of 40")
  expect(screen[3]!.trimEnd()).toBe(" ".repeat(20) + "row 06".padEnd(40, "."))
  expect(findText(island.host, "table")).toBe(title!)

  // gl's island moves between peeks as the cursor does: a table, then a line.
  island.update(linePeekModel({ content: "const answer = 42", lineNumber: 7, terminalWidth: 80, terminalHeight: 24 }))
  screen = await rows()
  expect(screen.map((row) => row.trim()).filter(Boolean)).toEqual(["line 7 17 cols", "const answer = 42", "Press gl or Esc to close"])

  island.update(null)
  screen = await rows()
  expect(screen.join("").trim()).toBe("")
  const cleared = setup.captureSpans()
  expect(cleared.lines.map((_, y) => bgAt(cleared, 0, y))).toEqual(empty.lines.map((_, y) => bgAt(empty, 0, y)))
  island.dispose()
})

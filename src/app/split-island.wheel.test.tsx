import { test, expect, afterEach, describe } from "bun:test"
import type { Renderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { LineSpans } from "../diff-rows/line-spans"
import { RowLineSource } from "../diff-rows/row-source"
import { parseDiff } from "../utils/diff-parser"
import { FileParses } from "../vim-diff/file-parses"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createSplitIsland, type SplitIsland } from "./split-island"

/*
 * Rows 1 to 40 pair `old n` on the left with `new n` on the right, two
 * different lines; rows 41 to 50 are removals alone, with nothing on the
 * right; rows 51 to 70 are context. Every line is wider than its pane.
 */
const WIDE = "x".repeat(100)
const DIFF = [
  "diff --git a/long.ts b/long.ts",
  "--- a/long.ts",
  "+++ b/long.ts",
  "@@ -1,70 +1,60 @@",
  ...Array.from({ length: 50 }, (_, n) => `-old ${n} ${WIDE}`),
  ...Array.from({ length: 40 }, (_, n) => `+new ${n} ${WIDE}`),
  ...Array.from({ length: 20 }, (_, n) => ` same ${n} ${WIDE}`),
].join("\n")

// The margin the app hands the island; twenty rows high, the wheel keeps all of it.
const SCROLL_OFF = 5
const HEIGHT = 20
// The header, 70 pairs and the divider closing the file.
const ROWS = 72
const BOTTOM = ROWS - HEIGHT

let setup: TestRendererSetup | null = null
let island: SplitIsland | null = null

afterEach(() => {
  island?.dispose()
  setup?.renderer.destroy()
  island = null
  setup = null
})

/** The host's laid-out size reaches the island a tick after the frame that laid it out. */
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0))

async function mount() {
  setup = await createTestRenderer({ width: 120, height: HEIGHT })
  island = createSplitIsland(setup.renderer, SCROLL_OFF)
  setup.renderer.root.add(island.host)
  const files = parseDiff(DIFF)
  const mapping = new DiffLineMapping(files, "all")
  const source = new RowLineSource(mapping, "split")
  source.setSide("right")
  island.update({
    mapping,
    source,
    files,
    lineSpans: new LineSpans(new FileParses(async () => null), async () => null),
    highlightVersion: 0,
    comments: [],
    marks: [],
    fileStatuses: new Map(),
    expandingDivider: null,
    cursor: { row: 0, col: 0 },
    side: "right",
    focused: true,
    selection: null,
    search: null,
    flash: null,
  })
  await frame()
  const dragged: number[] = []
  island.setOnCursorScrolledAway((line) => dragged.push(line))
  return { island, source, mapping, setup, dragged }
}

async function frame() {
  await setup!.renderOnce()
  await nextTick()
  await setup!.renderOnce()
  return setup!.captureCharFrame().split("\n")
}

type Direction = Parameters<TestRendererSetup["mockMouse"]["scroll"]>[2]

// A frame between ticks, as a slow wheel gives the app time to draw one after each.
async function wheel(direction: Direction, ticks = 1, shift = false) {
  for (let tick = 0; tick < ticks; tick++) {
    await setup!.mockMouse.scroll(10, 3, direction, { modifiers: { shift } })
    await setup!.renderOnce()
  }
}

/*
 * Ticks with no frame between them, as a fast wheel sends them. The hit
 * grid still names the rows the first ticks scrolled away; the island
 * keeps those rows, hidden, so each tick still reaches it.
 */
async function burst(direction: Direction, ticks: number, y: number) {
  for (let tick = 0; tick < ticks; tick++) await setup!.mockMouse.scroll(10, y, direction)
}

const pairAt = (source: RowLineSource, row: number) =>
  source.rows[row] as { kind: "pair"; left: number | undefined; right: number | undefined }

describe("split's mouse wheel", () => {
  test("three ticks down scroll three rows and leave a cursor still inside alone", async () => {
    const { island, dragged } = await mount()
    // The window's last row inside the margin.
    island.update({ cursor: { row: HEIGHT - 1 - SCROLL_OFF, col: 0 } })
    await wheel("down", 3)
    expect(island.scrollTop()).toBe(3)
    expect(dragged).toEqual([])
  })

  test("twelve ticks down drag the cursor to the top margin row, on the active side's line", async () => {
    const { island, source, dragged } = await mount()
    await wheel("down", 12)
    expect(island.scrollTop()).toBe(12)
    const row = 12 + SCROLL_OFF
    expect(dragged.at(-1)).toBe(pairAt(source, row).right!)
    expect(pairAt(source, row).left).not.toBe(pairAt(source, row).right)
  })

  test("a row with nothing on the active side hands over the other half's line", async () => {
    const { island, source, dragged } = await mount()
    await wheel("down", 38)
    const row = 38 + SCROLL_OFF
    expect(pairAt(source, row).right).toBeUndefined()
    expect(dragged.at(-1)).toBe(pairAt(source, row).left!)
    expect(island.scrollTop()).toBe(38)
  })

  for (const y of [0, 3, HEIGHT - 1]) {
    test(`ten ticks in one frame, the pointer on row ${y}, scroll ten rows`, async () => {
      const { island } = await mount()
      await burst("down", 10, y)
      expect(island.scrollTop()).toBe(10)
    })
  }

  test("ticks up at the top and down at the bottom stop there", async () => {
    const { island } = await mount()
    await wheel("up", 3)
    expect(island.scrollTop()).toBe(0)
    await wheel("down", ROWS + 10)
    expect(island.scrollTop()).toBe(BOTTOM)
    await burst("down", 5, 5)
    expect(island.scrollTop()).toBe(BOTTOM)
    await wheel("up")
    expect(island.scrollTop()).toBe(BOTTOM - 1)
  })

  test("a shift tick moves only the cursor's pane's column window, as zl does", async () => {
    const { island, source } = await mount()
    const { left, right } = pairAt(source, 1)
    island.update({ cursor: { row: 1, col: 0 } })
    island.scrollColumnsBy(2)
    const twoAlong = island.lineWindow(right!).startCol
    island.resetColumns()

    await wheel("down", 2, true)
    expect(island.lineWindow(right!).startCol).toBe(twoAlong)
    expect(island.lineWindow(left!).startCol).toBe(0)
    expect(island.scrollTop()).toBe(0)
    await wheel("up", 2, true)
    expect(island.lineWindow(right!).startCol).toBe(0)
  })

  test("the frame after a burst shows the window's rows", async () => {
    const { island } = await mount()
    await burst("down", 10, 5)
    await setup!.renderOnce()
    const rows = setup!.captureCharFrame().split("\n")
    expect(island.scrollTop()).toBe(10)
    // Row r pairs `old r-1` with `new r-1`, so the window's top row, row 10, shows the ninth of each.
    for (let y = 0; y < HEIGHT; y++) {
      expect(rows[y]).toContain(`old ${9 + y} `)
      expect(rows[y]).toContain(`new ${9 + y} `)
    }
  })

  test("the held rows are let go once a frame has been drawn without them", async () => {
    const renderablesOf = (node: Renderable): number =>
      node.getChildren().reduce((n, child) => n + renderablesOf(child as Renderable), 1)
    const scrolled = await mount()
    await burst("down", 10, 5)
    await setup!.renderOnce()
    const held = renderablesOf(scrolled.island.host)
    const settledRows = await frame()
    const settled = renderablesOf(scrolled.island.host)
    expect(settledRows[0]).toContain("old 9 ")
    island!.dispose()
    setup!.renderer.destroy()

    const { island: fresh } = await mount()
    // Ten rows down without the wheel, so nothing was ever held.
    fresh.scrollCursorTo(10 + SCROLL_OFF, "top")
    await frame()
    expect(fresh.scrollTop()).toBe(10)
    expect(settled).toBe(renderablesOf(fresh.host))
    expect(held).toBeGreaterThan(settled)
  })
})

import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { LineSpans } from "../diff-rows/line-spans"
import { RowLineSource } from "../diff-rows/row-source"
import { trimFrame } from "../testing/frame"
import { parseDiff } from "../utils/diff-parser"
import { FileParses } from "../vim-diff/file-parses"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createSplitIsland, type SplitIsland } from "./split-island"

/** Forty paired lines: row 0 is the file header and row 1 + n pairs line n. */
const LONG = [
  "diff --git a/long.ts b/long.ts",
  "--- a/long.ts",
  "+++ b/long.ts",
  "@@ -1,40 +1,40 @@",
  ...Array.from({ length: 40 }, (_, n) => `-old ${n}`),
  ...Array.from({ length: 40 }, (_, n) => `+new ${n}`),
].join("\n")

let setup: TestRendererSetup | null = null
let island: SplitIsland | null = null

afterEach(() => {
  island?.dispose()
  setup?.renderer.destroy()
  island = null
  setup = null
})

async function mount(height: number, parent?: (setup: TestRendererSetup) => BoxRenderable) {
  setup = await createTestRenderer({ width: 120, height })
  island = createSplitIsland(setup.renderer, 2)
  ;(parent?.(setup) ?? setup.renderer.root).add(island.host)
  const files = parseDiff(LONG)
  const mapping = new DiffLineMapping(files, "all")
  const source = new RowLineSource(mapping, "split")
  island.update({
    mapping,
    source,
    files,
    lineSpans: new LineSpans(new FileParses(async () => null), async () => null),
    highlightVersion: 0,
    comments: [],
    fileStatuses: new Map(),
    expandingDivider: null,
    cursor: { row: 0, col: 0 },
    side: "right",
    columns: { left: 0, right: 0 },
    focused: true,
  })
  return { island, source }
}

/** The host's laid-out size reaches the island a tick after the frame that laid it out. */
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0))

async function frame() {
  await setup!.renderOnce()
  await nextTick()
  await setup!.renderOnce()
  return trimFrame(setup!.captureCharFrame()).split("\n")
}

test("takes its height from the box it is laid out in", async () => {
  const { island } = await mount(10)
  const rows = await frame()
  expect(island.viewportHeight()).toBe(10)
  expect(rows).toHaveLength(10)
  expect(rows[1]).toContain("old 0")
  expect(rows[1]).toContain("new 0")
})

test("scrolls the cursor row into view, keeping the margin", async () => {
  const { island } = await mount(10)
  await frame()

  island.update({ cursor: { row: 20, col: 0 } })
  island.ensureCursorVisible(20)
  const rows = await frame()

  // Row 20 sits two rows above the bottom edge, so the window starts at row 13.
  expect(rows[0]).toContain("old 12")
  expect(rows[7]).toContain("new 19")
  expect(island.visibleLines()).toHaveLength(20)
})

test("zt puts the cursor row a margin from the top, and never past the last row", async () => {
  const { island } = await mount(10)
  await frame()

  island.scrollCursorTo(12, "top")
  expect((await frame())[0]).toContain("old 9")

  island.scrollCursorTo(40, "top")
  const rows = await frame()
  expect(rows.findIndex((row) => row.includes("new 39"))).toBeGreaterThan(5)
})

test("the active side's line comes before its partner's", async () => {
  const { island, source } = await mount(4)
  await frame()
  const pair = source.rows[1]
  if (pair?.kind !== "pair") throw new Error("row 1 pairs the first removal with the first addition")
  expect(island.visibleLines().slice(1, 3)).toEqual([pair.right!, pair.left!])
  island.update({ side: "left" })
  expect(island.visibleLines().slice(1, 3)).toEqual([pair.left!, pair.right!])
})

test("a seeded size draws rows in the first frame, before the host is laid out", async () => {
  const { island } = await mount(10)
  island.seedSize(120, 10)
  await setup!.renderOnce()
  expect(trimFrame(setup!.captureCharFrame())).toContain("old 0")
})

test("a host that shrinks keeps drawing code until the rows follow it", async () => {
  let box: BoxRenderable | null = null
  const { island } = await mount(20, ({ renderer }) => {
    box = new BoxRenderable(renderer, { width: "100%", height: 20 })
    renderer.root.add(box)
    return box
  })
  await frame()

  box!.height = 19
  await setup!.renderOnce()
  expect(trimFrame(setup!.captureCharFrame()).split("\n")[3]).toContain("old 2")

  const rows = await frame()
  expect(island.viewportHeight()).toBe(19)
  expect(rows[3]).toContain("old 2")
  expect(rows[3]).toContain("new 2")
})

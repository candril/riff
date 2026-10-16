import { test, expect, afterEach, describe } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { LineSpans } from "../diff-rows/line-spans"
import { RowLineSource } from "../diff-rows/row-source"
import { ONE_WIDE_LINE } from "../testing/diffs"
import { trimFrame } from "../testing/frame"
import { bgAt, ints } from "../testing/split-frame"
import { theme } from "../theme"
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

async function mount(height: number, parent?: (setup: TestRendererSetup) => BoxRenderable, raw = LONG) {
  setup = await createTestRenderer({ width: 120, height })
  island = createSplitIsland(setup.renderer, 2)
  ;(parent?.(setup) ?? setup.renderer.root).add(island.host)
  const files = parseDiff(raw)
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
    focused: true,
    selection: null,
    search: null,
    flash: null,
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

test("a fold that leaves fewer rows brings the cursor's row back into the window", async () => {
  const tail = ["diff --git a/tail.ts b/tail.ts", "--- a/tail.ts", "+++ b/tail.ts", "@@ -1,1 +1,1 @@", "-tail old", "+tail new"]
  const raw = [LONG, ...tail].join("\n")
  const { island, source } = await mount(10, undefined, raw)
  await frame()
  const last = source.rows.length - 1
  island.update({ cursor: { row: last, col: 0 } })
  island.ensureCursorVisible(last)
  expect((await frame()).join("\n")).toContain("tail new")

  const files = parseDiff(raw)
  const mapping = new DiffLineMapping(files, "all", undefined, { collapsedFiles: new Set(["long.ts"]) })
  const folded = new RowLineSource(mapping, "split")
  expect(folded.rows.length).toBeLessThan(10)
  island.update({ mapping, source: folded, files, cursor: { row: folded.rows.length - 1, col: 0 } })
  const rows = await frame()
  expect(rows[0]).toContain("long.ts")
  expect(rows.join("\n")).toContain("tail new")
})

test("a selection reaches the view, follows its changes and goes when it is cleared", async () => {
  const { island } = await mount(10)
  await frame()
  // Row 1's left half reads "old 0" from its fifth cell on; the cursor stays on row 0, out of the way.
  const selectedAt = (x: number) => bgAt(setup!.captureSpans(), x, 1)
  const selection = { mode: "visual", startRow: 1, startCol: 0, endRow: 1, endCol: 1 } as const

  island.update({ side: "left", selection })
  await frame()
  expect(selectedAt(6)).toEqual(ints(theme.surface1))
  expect(selectedAt(7)).not.toEqual(ints(theme.surface1))

  island.update({ selection: { ...selection, endCol: 2 } })
  await frame()
  expect(selectedAt(7)).toEqual(ints(theme.surface1))

  island.update({ selection: null })
  await frame()
  expect(selectedAt(5)).not.toEqual(ints(theme.surface1))
})

describe("sidescroll", () => {
  // ONE_WIDE_LINE at 120 columns: row 2 pairs "const wide = 0" with a 175-cell line, in 55-cell panes.
  const WIDE_ROW = 2
  const rightHalf = (row: string) => row.slice(60)
  const leftHalf = (row: string) => row.slice(0, 60)

  async function mountWide() {
    const mounted = await mount(8, undefined, ONE_WIDE_LINE)
    await frame()
    return mounted
  }

  test("the cursor's pane follows it sideways while the other pane keeps its window", async () => {
    const { island } = await mountWide()
    island.update({ cursor: { row: WIDE_ROW, col: 120 } })
    island.revealColumn()
    const rows = await frame()

    // The cursor stays eight cells clear of the `›` at the pane's right edge.
    expect(rightHalf(rows[WIDE_ROW]!)).toStartWith("   2 ‹")
    expect(rightHalf(rows[WIDE_ROW]!)).toEndWith("›")
    expect(leftHalf(rows[WIDE_ROW]!)).toStartWith("   2 const wide = 0")
    expect(island.columnStatus()).toEqual({ col: 121, total: 175 })

    island.update({ side: "left", cursor: { row: WIDE_ROW, col: 3 } })
    island.revealColumn()
    const crossed = await frame()
    expect(rightHalf(crossed[WIDE_ROW]!)).toBe(rightHalf(rows[WIDE_ROW]!))
    expect(island.columnStatus()).toBeNull()
  })

  test("zl drags the cursor along, zs puts it at the left edge, and the readout goes on an empty half", async () => {
    const { island } = await mountWide()
    island.update({ cursor: { row: WIDE_ROW, col: 0 } })
    island.scrollColumnsBy(10)
    expect(island.clampCursorColumn(0)).toBe(11)
    expect(island.halfColumnWindow()).toBe(27)

    island.update({ cursor: { row: WIDE_ROW, col: 100 } })
    island.scrollColumnToEdge("start")
    const rows = await frame()
    expect(rightHalf(rows[WIDE_ROW]!)).toStartWith("   2 ‹..col110")

    // Row 0 is the file header, which never scrolls sideways.
    island.update({ cursor: { row: 0, col: 0 } })
    island.scrollColumnsBy(5)
    expect(island.columnStatus()).toBeNull()
    island.resetColumns()
    expect(rightHalf((await frame())[WIDE_ROW]!)).toStartWith("   2 const wide =")
  })

  test("flash looks at each line in the window of the pane that draws it", async () => {
    const { island } = await mountWide()
    island.update({ cursor: { row: WIDE_ROW, col: 120 } })
    island.revealColumn()
    // The new pane starts at column 74, behind its `‹`; the old one was never scrolled.
    expect(island.lineWindow(3)).toEqual({ startCol: 75, endCol: 128 })
    expect(island.lineWindow(2)).toEqual({ startCol: 0, endCol: 55 })
    expect(island.lineWindow(1)).toEqual({ startCol: 75, endCol: 129 })
  })

  test("a resize that narrows the pane brings the cursor's column back into the cursor's half", async () => {
    let box: BoxRenderable | null = null
    const { island } = await mount(
      8,
      ({ renderer }) => {
        box = new BoxRenderable(renderer, { width: "100%", height: 8 })
        renderer.root.add(box)
        return box
      },
      ONE_WIDE_LINE
    )
    await frame()
    const wide = ONE_WIDE_LINE.split("\n").find((line) => line.startsWith("+const wide"))!.slice(1)
    const col = wide.indexOf("col180") + 3
    island.update({ cursor: { row: WIDE_ROW, col } })
    island.revealColumn()
    expect(rightHalf((await frame())[WIDE_ROW]!)).toContain("col180")

    box!.width = 80
    const rows = await frame()
    expect(island.width()).toBe(80)
    expect(island.clampCursorColumn(col)).toBe(col)
    // Line 3 is the addition, drawn in the new pane, which starts at column 40 of 80.
    const { startCol, endCol } = island.lineWindow(3)
    expect(startCol).toBeLessThanOrEqual(col)
    expect(endCol).toBeGreaterThan(col)
    expect(rows[WIDE_ROW]!.slice(40)).toContain("col180")
  })

  test("the readout counts a tab as the cells it draws in, so the last character reads the total", async () => {
    const content = `\t\tconst wide = "${"x".repeat(100)}"`
    const raw = ["diff --git a/t.go b/t.go", "--- a/t.go", "+++ b/t.go", "@@ -1,1 +1,1 @@", "-old", `+${content}`].join("\n")
    const { island } = await mount(8, undefined, raw)
    await frame()
    const total = content.length + 2
    island.update({ cursor: { row: 1, col: content.length - 1 } })
    expect(island.columnStatus()).toEqual({ col: total, total })
    island.update({ cursor: { row: 1, col: 2 } })
    expect(island.columnStatus()).toEqual({ col: 5, total })
  })
})

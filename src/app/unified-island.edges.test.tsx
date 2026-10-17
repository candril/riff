import { test, expect, afterEach, describe } from "bun:test"
import type { Renderable } from "@opentui/core"
import { MANY_WRAPPED_LINES, ONE_LONG_LINE, ONE_WIDE_LINE, SIXTY_LINES, TWO_FILES } from "../testing/diffs"
import { fgAt, ints } from "../testing/split-frame"
import { mountIsland, type MountIslandOptions } from "../testing/unified-island"
import { colors } from "../theme"

/*
 * Where unified's island meets its edges: an empty diff, the last row, the
 * widest line and the mouse wheel.
 */

let mounted: Awaited<ReturnType<typeof mountIsland>> | null = null

afterEach(() => {
  mounted?.dispose()
  mounted = null
})

async function mount(options: MountIslandOptions) {
  mounted = await mountIsland(options)
  await mounted.frame()
  return mounted
}

describe("an empty diff", () => {
  const centred: [string, string][] = [
    ["No changes to display", "                   No changes to display"],
    ["No files match /zzz", "                    No files match /zzz"],
  ]

  for (const [message, row] of centred) {
    test(`says "${message}" in the middle of the pane`, async () => {
      const { frame } = await mount({ raw: "", width: 60, height: 11, emptyMessage: message })
      expect(await frame()).toEqual(["", "", "", "", "", row])
    })
  }

  test("is drawn in dim text", async () => {
    const { frame, setup } = await mount({ raw: "", width: 60, height: 11 })
    const rows = await frame()
    const y = rows.findIndex((row) => row.includes("No changes"))
    const x = rows[y]!.indexOf("No changes")
    expect(fgAt(setup.captureSpans(), x, y)).toEqual(ints(colors.textDim))
  })

  test("gives way to the diff once there are lines", async () => {
    const { island, frame, mapping, files } = await mount({ raw: TWO_FILES, width: 60, height: 11 })
    island.update({ files: [] })
    expect((await frame()).join("\n")).toContain("No changes to display")
    island.update({ files, mapping })
    const rows = await frame()
    expect(rows.join("\n")).not.toContain("No changes to display")
    expect(rows.join("\n")).toContain("src/greet.ts")
  })
})

describe("the window never runs past the last row", () => {
  test("turning wrap off at the bottom of a wrapped diff keeps a full window of rows", async () => {
    const { island, mapping, frame } = await mount({ raw: MANY_WRAPPED_LINES, width: 120, mode: "single", wrap: true })
    const last = mapping.lineCount - 1
    island.update({ cursor: { line: last, col: 0 } })
    island.ensureCursorVisible()
    const wrappedTop = island.scrollTop()
    expect(wrappedTop).toBeGreaterThan(mapping.lineCount - island.viewportHeight())

    island.update({ wrap: false })
    expect(island.scrollTop()).toBe(mapping.lineCount - island.viewportHeight())
    expect(island.visibleLines()).toHaveLength(island.viewportHeight())
    const rows = await frame()
    expect(rows).toHaveLength(island.viewportHeight())
    expect(rows.every((row) => row.trim() !== "")).toBe(true)
    expect(rows.at(-1)).toContain("rest of the file")

    // The clamp is kept: turning wrap back on does not jump back to where the window was.
    island.update({ wrap: true })
    expect(island.scrollTop()).toBe(mapping.lineCount - island.viewportHeight())
  })
})

/*
 * The stop is how far the content, the widest line beside its gutter and a
 * cell of padding, outruns the pane: a column further beside a scrollbar.
 */
describe("sideways, the window stops at the widest line", () => {
  const cases: [string, MountIslandOptions, number][] = [
    ["one long line", { raw: ONE_LONG_LINE, width: 80, height: 15 }, 19],
    ["one long line beside a scrollbar", { raw: ONE_LONG_LINE, width: 80, height: 4 }, 20],
    ["one long line, narrow", { raw: ONE_LONG_LINE, width: 40, height: 15 }, 59],
    ["two files, narrow", { raw: TWO_FILES, width: 30, height: 15 }, 17],
    ["two files, wide enough for every line", { raw: TWO_FILES, width: 80, height: 15 }, 0],
  ]

  for (const [name, options, stop] of cases) {
    test(name, async () => {
      const { island, mapping } = await mount(options)
      // A code line, which every window shows from the shared column on.
      const code = mapping.allLines.findIndex((line) => line.type === "context")
      island.update({ cursor: { line: code, col: 0 } })
      island.scrollColumnsBy(1000)
      expect(island.lineWindow(code).startCol).toBe(stop)
      island.scrollColumnsBy(-1)
      expect(island.lineWindow(code).startCol).toBe(Math.max(0, stop - 1))
    })
  }

  test("zl past the widest line leaves its last character against the right edge", async () => {
    const { island, mapping, frame } = await mount({ raw: ONE_LONG_LINE, width: 60, height: 8 })
    const long = mapping.allLines.findIndex((line) => line.content.includes("keeps going"))
    const content = mapping.getLine(long)!.content
    island.scrollColumnsBy(1000)
    const rows = await frame()
    // The content counts a cell past the line's end, so that cell is the last on the row.
    expect(rows[long]).toEndWith(content.slice(-1))
    expect(rows[long]).not.toContain("›")
    expect(rows[long]).toContain("‹")
  })

  test("the cursor's block past the widest line's end is still revealed at the stop", async () => {
    const { island, mapping } = await mount({ raw: ONE_LONG_LINE, width: 60, height: 8 })
    const long = mapping.allLines.findIndex((line) => line.content.includes("keeps going"))
    const length = mapping.getLine(long)!.content.length
    island.scrollColumnsBy(1000)
    const stop = island.lineWindow(long).startCol
    island.resetColumns()
    island.update({ cursor: { line: long, col: length } })
    island.revealColumn()
    const window = island.lineWindow(long)
    expect(window.startCol).toBe(stop)
    expect(window.endCol).toBeGreaterThan(length)
  })
})

describe("the mouse wheel", () => {
  // The margin the app hands the island.
  const SCROLL_OFF = 5

  type Setup = Awaited<ReturnType<typeof mountIsland>>["setup"]
  type Direction = Parameters<Setup["mockMouse"]["scroll"]>[2]

  // A frame between ticks, as a slow wheel gives the app time to draw one after each.
  async function wheel(setup: Setup, direction: Direction, ticks = 1, shift = false) {
    for (let tick = 0; tick < ticks; tick++) {
      await setup.mockMouse.scroll(10, 3, direction, { modifiers: { shift } })
      await setup.renderOnce()
    }
  }

  /*
   * Ticks with no frame between them, as a fast wheel sends them. The hit
   * grid still names the rows the first ticks scrolled away; the island
   * keeps those rows, hidden, so each tick still reaches it.
   */
  async function burst(setup: Setup, direction: Direction, ticks: number, y: number) {
    for (let tick = 0; tick < ticks; tick++) await setup.mockMouse.scroll(10, y, direction)
  }

  const cases: [string, MountIslandOptions, number][] = [
    ["all files", { raw: SIXTY_LINES, width: 80, height: 10 }, 16],
    ["wrapped", { raw: MANY_WRAPPED_LINES, width: 120, height: 10, wrap: true }, 8],
  ]

  for (const [name, options, draggedTo] of cases) {
    test(`${name}: twelve ticks down scroll twelve rows and drag the cursor along`, async () => {
      const { island, setup } = await mount({ ...options, scrollOff: SCROLL_OFF })
      const dragged: number[] = []
      island.setOnCursorScrolledAway((line) => dragged.push(line))
      await wheel(setup, "down", 12)
      expect(island.scrollTop()).toBe(12)
      expect(dragged.at(-1)).toBe(draggedTo)
    })
  }

  for (const y of [1, 5, 8]) {
    test(`ten ticks in one frame, the pointer on row ${y}, scroll ten rows`, async () => {
      const { island, setup } = await mount({ raw: SIXTY_LINES, width: 80, height: 10, scrollOff: SCROLL_OFF })
      await burst(setup, "down", 10, y)
      expect(island.scrollTop()).toBe(10)
    })
  }

  test("ten ticks in one frame over wrapped lines scroll ten rows", async () => {
    const { island, setup } = await mount({ raw: MANY_WRAPPED_LINES, width: 120, wrap: true, height: 10, scrollOff: SCROLL_OFF })
    await burst(setup, "down", 10, 5)
    expect(island.scrollTop()).toBe(10)
  })

  test("ten ticks up in one frame from the last row come back ten rows", async () => {
    const { island, setup, mapping, frame } = await mount({ raw: SIXTY_LINES, scrollOff: SCROLL_OFF })
    const bottom = mapping.lineCount - island.viewportHeight()
    island.update({ cursor: { line: mapping.lineCount - 1, col: 0 } })
    island.ensureCursorVisible()
    await frame()
    expect(island.scrollTop()).toBe(bottom)
    await burst(setup, "up", 10, 5)
    expect(island.scrollTop()).toBe(bottom - 10)
  })

  test("the frame after a burst shows the window's rows and none of the held ones", async () => {
    const { island, setup } = await mount({ raw: SIXTY_LINES, scrollOff: SCROLL_OFF })
    await burst(setup, "down", 10, 5)
    await setup.renderOnce()
    const rows = setup.captureCharFrame().split("\n")
    expect(island.scrollTop()).toBe(10)
    // Row 0 is the pinned header, over the line scrolled to the top.
    expect(rows[0]).toContain("sixty.ts")
    for (let y = 1; y < 10; y++) expect(rows[y]).toContain(`const line${10 + y} = ${10 + y}`)
  })

  test("the frame after a burst past a file's header shows none of the held chrome", async () => {
    // Five rows high, so nine ticks carry the window past greet.ts's divider and farewell.ts's header.
    const { island, setup } = await mount({ raw: TWO_FILES, height: 5, scrollOff: SCROLL_OFF })
    await burst(setup, "down", 9, 3)
    await setup.renderOnce()
    const rows = setup.captureCharFrame().split("\n").map((row) => row.trimEnd())
    expect(island.scrollTop()).toBe(9)
    // Row 0 is the pinned header, over the line scrolled to the top.
    expect(rows.slice(0, 5)).toEqual([
      " ▼   src/farewell.ts +3 -0",
      "    1 export function farewell(name: string) {",
      '    2   return "Bye " + name',
      "    3 }                                                                        ▄",
      "      ▸ rest of the file  ↵                                                    █",
    ])
  })

  test("the held rows are let go once a frame has been drawn without them", async () => {
    const renderablesOf = (node: Renderable): number => node.getChildren().reduce((n, child) => n + renderablesOf(child as Renderable), 1)
    const scrolled = await mount({ raw: SIXTY_LINES, scrollOff: SCROLL_OFF })
    await burst(scrolled.setup, "down", 10, 5)
    await scrolled.setup.renderOnce()
    const held = renderablesOf(scrolled.island.host)
    await scrolled.frame()
    const settled = renderablesOf(scrolled.island.host)
    scrolled.dispose()

    const { island, frame } = await mount({ raw: SIXTY_LINES, scrollOff: SCROLL_OFF })
    // Ten rows down without the wheel, so nothing was ever held: zt keeps four rows above the cursor in ten.
    island.update({ cursor: { line: 14, col: 0 } })
    island.scrollCursorTo("top")
    await frame()
    expect(island.scrollTop()).toBe(10)
    expect(settled).toBe(renderablesOf(island.host))
    expect(held).toBeGreaterThan(settled)
  })

  test("a burst drags the cursor along", async () => {
    const { island, setup } = await mount({ raw: SIXTY_LINES, width: 80, height: 10, scrollOff: SCROLL_OFF })
    const dragged: number[] = []
    island.setOnCursorScrolledAway((line) => dragged.push(line))
    await burst(setup, "down", 10, 5)
    expect(dragged.at(-1)).toBe(14)
  })

  test("the frame follows the wheel, and the window stops at the last row", async () => {
    const { island, setup, frame, mapping } = await mount({ raw: SIXTY_LINES, scrollOff: SCROLL_OFF })
    await wheel(setup, "down", 3)
    const rows = await frame()
    expect(island.scrollTop()).toBe(3)
    // Row 0 is the pinned header, over the line that was scrolled to the top.
    expect(rows[0]).toContain("sixty.ts")
    expect(rows[1]).toContain("const line4 = 4")
    await wheel(setup, "down", 100)
    expect(island.scrollTop()).toBe(mapping.lineCount - island.viewportHeight())
    await wheel(setup, "up")
    expect(island.scrollTop()).toBe(mapping.lineCount - island.viewportHeight() - 1)
  })

  test("a cursor still inside the window is left alone, and the island's own reveals never drag it", async () => {
    const { island, setup } = await mount({ raw: SIXTY_LINES, scrollOff: SCROLL_OFF })
    const dragged: number[] = []
    island.setOnCursorScrolledAway((line) => dragged.push(line))
    island.update({ cursor: { line: 30, col: 0 } })
    island.ensureCursorVisible()
    island.scrollCursorTo("top")
    island.scrollCursorTo("bottom")
    expect(dragged).toEqual([])
    await wheel(setup, "down")
    expect(dragged).toEqual([])
  })

  test("sideways and shift turn it into columns, through the same stop as zl, and not while wrapped", async () => {
    const { island, setup, mapping } = await mount({ raw: ONE_WIDE_LINE, height: 8 })
    const wide = mapping.allLines.findIndex((line) => line.content.includes("col000"))
    await wheel(setup, "right")
    await wheel(setup, "down", 1, true)
    expect(island.lineWindow(wide).startCol).toBe(2)
    expect(island.scrollTop()).toBe(0)
    await wheel(setup, "left")
    expect(island.lineWindow(wide).startCol).toBe(1)
    island.scrollColumnsBy(1000)
    const stop = island.lineWindow(wide).startCol
    island.resetColumns()
    await wheel(setup, "right", stop + 20)
    expect(island.lineWindow(wide).startCol).toBe(stop)

    island.resetColumns()
    island.update({ wrap: true })
    await wheel(setup, "right")
    island.update({ wrap: false })
    expect(island.lineWindow(wide).startCol).toBe(0)
  })
})

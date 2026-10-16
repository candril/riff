import { test, expect, afterEach, describe } from "bun:test"
import { MANY_WRAPPED_LINES, ONE_LONG_LINE, ONE_WIDE_LINE, SIXTY_LINES, TWO_FILES } from "../testing/diffs"
import { mountDiffView, type MountDiffViewOptions } from "../testing/frame"
import { fgAt, ints } from "../testing/split-frame"
import { mountIsland, type MountIslandOptions } from "../testing/unified-island"
import { colors } from "../theme"
import { DiffLineMapping } from "../vim-diff/line-mapping"

/*
 * Where unified's island meets the edges VimDiffView's scrollbox drew for
 * it: an empty diff, the last row, the widest line and the mouse wheel.
 * VimDiffView is mounted under the app's one-row header, so the island is
 * given a row less and its rows are compared against VimDiffView's from
 * the second on.
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

/** VimDiffView on the same diff, the screen a row taller for its header. */
async function withOld<T>(options: MountDiffViewOptions, read: (old: Awaited<ReturnType<typeof mountDiffView>>) => Promise<T>) {
  const old = await mountDiffView(options)
  await old.frame()
  try {
    return await read(old)
  } finally {
    await old.dispose()
  }
}

describe("an empty diff", () => {
  for (const message of ["No changes to display", "No files match /zzz"]) {
    test(`says "${message}" where VimDiffView does`, async () => {
      const old = await withOld({ raw: "", width: 60, height: 12 }, async (old) => {
        old.view.setEmptyMessage(message)
        // The message is read at rebuild time, which a filter change brings with a new mapping.
        old.view.update([], null, new DiffLineMapping([], "all"), old.cursor, [], new Map(), null, null)
        return (await old.frame()).split("\n").slice(1)
      })
      const { frame } = await mount({ raw: "", width: 60, height: 11, emptyMessage: message })
      const rows = await frame()
      expect(rows.join("\n")).toContain(message)
      expect(rows).toEqual(old)
    })
  }

  test("is drawn in VimDiffView's dim text", async () => {
    const { frame, setup } = await mount({ raw: "", width: 60, height: 11 })
    const rows = await frame()
    const y = rows.findIndex((row) => row.includes("No changes"))
    const x = rows[y]!.indexOf("No changes")
    expect(fgAt(setup.captureSpans(), x, y)).toEqual(ints(colors.textDim))
    const old = await withOld({ raw: "", width: 60, height: 12 }, async (old) => fgAt(old.setup.captureSpans(), x, y + 1))
    expect(old).toEqual(ints(colors.textDim))
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

describe("sideways, the window stops at the widest line as VimDiffView's does", () => {
  const cases: [string, MountIslandOptions][] = [
    ["one long line", { raw: ONE_LONG_LINE, width: 80, height: 15 }],
    ["one long line beside a scrollbar", { raw: ONE_LONG_LINE, width: 80, height: 4 }],
    ["one long line, narrow", { raw: ONE_LONG_LINE, width: 40, height: 15 }],
    ["two files, narrow", { raw: TWO_FILES, width: 30, height: 15 }],
    ["two files, wide enough for every line", { raw: TWO_FILES, width: 80, height: 15 }],
  ]

  for (const [name, options] of cases) {
    test(name, async () => {
      const height = options.height! + 1
      const stop = await withOld({ raw: options.raw, width: options.width, height }, async (old) => {
        old.view.scrollColumnsBy(1000)
        await old.frame()
        return old.view.getScrollBox()!.scrollLeft
      })
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
  // VimDiffView's VERTICAL_SCROLL_OFF, which the app hands the island.
  const SCROLL_OFF = 5

  type Setup = Awaited<ReturnType<typeof mountIsland>>["setup"]
  type Direction = Parameters<Setup["mockMouse"]["scroll"]>[2]

  /*
   * A frame between ticks, as the app draws one after each: a tick that arrives
   * once the row under the pointer has scrolled away hits that row's stale cell
   * in the hit grid and is dropped until the next frame lays the new rows out.
   */
  async function wheel(setup: Setup, direction: Direction, ticks = 1, shift = false) {
    for (let tick = 0; tick < ticks; tick++) {
      await setup.mockMouse.scroll(10, 3, direction, { modifiers: { shift } })
      await setup.renderOnce()
    }
  }

  async function wheelOld(options: MountDiffViewOptions, ticks: number) {
    return withOld(options, async (old) => {
      let dragged: number | null = null
      old.view.setOnCursorScrolledAway((line) => (dragged = line))
      for (let tick = 0; tick < ticks; tick++) {
        await old.setup.mockMouse.scroll(10, 5, "down")
        await old.frame()
      }
      return { scrollTop: old.view.getScrollBox()!.scrollTop, dragged }
    })
  }

  const cases: [string, MountIslandOptions][] = [
    ["all files", { raw: SIXTY_LINES, width: 80, height: 10 }],
    ["wrapped", { raw: MANY_WRAPPED_LINES, width: 120, height: 10, wrap: true }],
  ]

  for (const [name, options] of cases) {
    test(`${name}: twelve ticks down scroll and drag the cursor as VimDiffView does`, async () => {
      const old = await wheelOld({ raw: options.raw, width: options.width, height: options.height! + 1, wrap: options.wrap }, 12)
      const { island, setup } = await mount({ ...options, scrollOff: SCROLL_OFF })
      const dragged: number[] = []
      island.setOnCursorScrolledAway((line) => dragged.push(line))
      await wheel(setup, "down", 12)
      expect(island.scrollTop()).toBe(old.scrollTop)
      expect(dragged.at(-1)).toBe(old.dragged!)
    })
  }

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

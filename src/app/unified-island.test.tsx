import { test, expect, afterEach, describe } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { cellOfColumn } from "../diff-rows/cells"
import {
  MANY_WRAPPED_LINES,
  MIXED_DIGITS,
  ONE_LONG_LINE,
  ONE_WIDE_LINE,
  SHORT_THEN_MANY_WRAPPED,
  SIXTY_LINES,
  TAB_LINE,
  TAB_LINE_CONTENT,
  THREE_FILES,
  TWO_FILES,
} from "../testing/diffs"
import { mountIsland, type MountIslandOptions } from "../testing/unified-island"
import { parseDiff } from "../utils/diff-parser"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { placeRow } from "./split-scroll"

let mounted: Awaited<ReturnType<typeof mountIsland>> | null = null

afterEach(() => {
  mounted?.dispose()
  mounted = null
})

async function mount(options: MountIslandOptions) {
  mounted = await mountIsland(options)
  return mounted
}

const frame = () => mounted!.frame()

const lineOf = (mapping: DiffLineMapping, text: string) => mapping.allLines.findIndex((line) => line.content.includes(text))

test("answers with nothing before its first full update", async () => {
  const { island } = await mount({ raw: TWO_FILES, bare: true })
  await frame()
  island.ensureCursorVisible()
  island.revealColumn()
  island.scrollColumnsBy(4)
  expect(island.cursorRow()).toBe(-1)
  expect(island.scrollTop()).toBe(0)
  expect(island.visibleLines()).toEqual([])
  expect(island.visibleFilenames()).toEqual([])
  expect(island.visibleRegion()).toBeNull()
  expect(island.columnStatus()).toBeNull()
  expect(island.clampCursorColumn(7)).toBe(7)
  expect(island.lineWindows(0)).toEqual([{ startCol: 0, endCol: 0 }])
})

describe("vertical scroll", () => {
  test("j keeps the margin, and the window stops at both ends of the diff", async () => {
    const { island, mapping } = await mount({ raw: SIXTY_LINES, mode: "single" })
    await frame()
    expect(island.viewportHeight()).toBe(10)
    const last = mapping.lineCount - 1
    for (let line = 0; line <= last; line++) {
      island.update({ cursor: { line, col: 0 } })
      island.ensureCursorVisible()
      const top = island.scrollTop()
      expect(top).toBe(Math.max(0, Math.min(line - 7, last + 1 - 10)))
      expect(island.visibleLines()[0]).toBe(top)
    }
    const rows = await frame()
    expect(rows[8]).toContain("const line60 = 60")
    expect(rows[9]).toContain("rest of the file")

    for (let line = last; line >= 0; line--) {
      island.update({ cursor: { line, col: 0 } })
      island.ensureCursorVisible()
    }
    expect(island.scrollTop()).toBe(0)
    expect((await frame())[0]).toContain("const line1 = 1")
  })

  test("a wrapped line whose cursor sits on its second slice reveals that slice's row", async () => {
    const { island, mapping } = await mount({ raw: MANY_WRAPPED_LINES, width: 120, mode: "single", wrap: true })
    await frame()
    const line = lineOf(mapping, "const line30 ")
    const col = mapping.getLine(line)!.content.length - 2
    island.update({ cursor: { line, col } })
    island.ensureCursorVisible()

    const row = island.cursorRow()
    expect(row - island.scrollTop()).toBe(10 - 1 - 2)
    const rows = await frame()
    expect(rows[7]).toContain("↳")
    expect(rows[6]).toContain("const line30 ")
  })

  test("zz, zt and zb place the cursor's row as placeRow does", async () => {
    const { island, mapping } = await mount({ raw: SIXTY_LINES, mode: "single" })
    await frame()
    const rows = mapping.lineCount
    island.update({ cursor: { line: 30, col: 0 } })
    for (const [where, expected] of [["center", 25], ["top", 28], ["bottom", 23]] as const) {
      island.scrollCursorTo(where)
      expect(island.scrollTop()).toBe(expected)
      expect(island.scrollTop()).toBe(placeRow({ scrollTop: 0, height: 10, rows }, 30, where, 2))
    }
    island.update({ cursor: { line: rows - 1, col: 0 } })
    island.scrollCursorTo("top")
    expect(island.scrollTop()).toBe(rows - 10)
  })

  test("a new mapping reveals the cursor again", async () => {
    const { island } = await mount({ raw: SIXTY_LINES, mode: "single" })
    await frame()
    island.update({ cursor: { line: 50, col: 0 } })
    island.ensureCursorVisible()
    const files = parseDiff(TWO_FILES)
    island.update({ mapping: new DiffLineMapping(files, "all"), files, cursor: { line: 3, col: 0 } })
    expect(island.scrollTop()).toBe(3 - 2)
  })

  test("a deferred resize keeps the cursor in view", async () => {
    let box: BoxRenderable | null = null
    const { island, mapping } = await mount({
      raw: SIXTY_LINES,
      height: 20,
      mode: "single",
      parent: ({ renderer }) => {
        box = new BoxRenderable(renderer, { width: "100%", height: 20 })
        renderer.root.add(box)
        return box
      },
    })
    island.seedSize(80, 20)
    const line = lineOf(mapping, "const line16 ")
    island.update({ cursor: { line, col: 0 } })
    island.ensureCursorVisible()
    expect(island.scrollTop()).toBe(0)

    box!.height = 8
    const rows = await frame()
    expect(island.viewportHeight()).toBe(8)
    expect(island.scrollTop()).toBe(line - 8 + 2 + 1)
    expect(rows[5]).toContain("const line16 = 16")
  })
})

describe("sidescroll", () => {
  // ONE_WIDE_LINE at 80 columns: a 175-cell line beside a 5-cell gutter, so 75 cells of code.
  async function mountWide(height = 8) {
    const mounted = await mount({ raw: ONE_WIDE_LINE, height })
    await frame()
    return { ...mounted, wide: lineOf(mounted.mapping, "col000") }
  }

  test("the window follows the cursor, eight cells clear of the right edge", async () => {
    const { island, wide } = await mountWide()
    island.update({ cursor: { line: wide, col: 120 } })
    island.revealColumn()
    const rows = await frame()

    expect(island.lineWindow(wide)).toEqual({ startCol: 54, endCol: 129 })
    expect(rows[wide]).toContain("‹")
    expect(rows[wide]).toEndWith("›")
    expect(island.columnStatus()).toEqual({ col: 121, total: 175 })
    expect(island.halfColumnWindow()).toBe(37)
  })

  test("zl moves the one window from a file header, zs and ze put the cursor at an edge", async () => {
    const { island, wide } = await mountWide()
    island.update({ cursor: { line: 0, col: 0 } })
    island.scrollColumnsBy(5)
    expect(island.lineWindow(wide).startCol).toBe(5)
    expect((await frame())[wide]).toContain("‹")

    island.update({ cursor: { line: wide, col: 100 } })
    island.scrollColumnToEdge("start")
    expect(island.lineWindow(wide)).toEqual({ startCol: 100, endCol: 175 })
    island.scrollColumnToEdge("end")
    expect(island.lineWindow(wide)).toEqual({ startCol: 26, endCol: 101 })

    // The window shows cells 26 to 100, and the line ends at 174.
    expect(island.clampCursorColumn(0)).toBe(26)
    expect(island.clampCursorColumn(200)).toBe(100)
    expect(island.clampCursorColumn(60)).toBe(60)

    island.resetColumns()
    expect(island.lineWindow(wide).startCol).toBe(0)
    expect((await frame())[wide]).not.toContain("‹")
  })

  test("a header line takes no part in a reveal, an edge or a clamp", async () => {
    const { island, wide } = await mountWide()
    island.update({ cursor: { line: 0, col: 100 } })
    island.revealColumn()
    island.scrollColumnToEdge("start")
    expect(island.lineWindow(wide).startCol).toBe(0)
    expect(island.clampCursorColumn(100)).toBe(100)
    expect(island.columnStatus()).toBeNull()
  })

  test("wrapped, nothing scrolls sideways and nothing reads a column", async () => {
    const { island, wide } = await mountWide()
    island.update({ wrap: true, cursor: { line: wide, col: 120 } })
    island.revealColumn()
    island.scrollColumnsBy(10)
    island.scrollColumnToEdge("start")
    expect(island.clampCursorColumn(3)).toBe(3)
    expect(island.columnStatus()).toBeNull()
    island.update({ wrap: false })
    expect(island.lineWindow(wide).startCol).toBe(0)
  })

  test("a cursor back at the start of the line brings the window back to the first column", async () => {
    const { island, wide } = await mountWide()
    island.update({ cursor: { line: wide, col: 80 } })
    island.revealColumn()
    expect(island.lineWindow(wide).startCol).toBeGreaterThan(0)
    expect(island.lineWindow(wide).startCol).toBeLessThanOrEqual(80)
    island.update({ cursor: { line: wide, col: 0 } })
    island.revealColumn()
    expect(island.lineWindow(wide).startCol).toBe(0)
  })

  // At 120 columns the window shows up to cell 170, past "col180" at 158; narrowed to 80 it would stop short of it.
  async function narrowedOnCol180() {
    let box: BoxRenderable | null = null
    const mounted = await mount({
      raw: ONE_WIDE_LINE,
      width: 120,
      height: 8,
      parent: ({ renderer }) => {
        box = new BoxRenderable(renderer, { width: "100%", height: 8 })
        renderer.root.add(box)
        return box
      },
    })
    await frame()
    const wide = lineOf(mounted.mapping, "col000")
    const col = mounted.mapping.getLine(wide)!.content.indexOf("col180") + 3
    mounted.island.update({ cursor: { line: wide, col } })
    mounted.island.revealColumn()
    box!.width = 80
    const rows = await frame()
    return { ...mounted, wide, col, rows }
  }

  test("a resize that narrows the pane brings the cursor's column back into the window", async () => {
    const { island, wide, col, rows } = await narrowedOnCol180()
    expect(island.width()).toBe(80)
    expect(island.clampCursorColumn(col)).toBe(col)
    const { startCol, endCol } = island.lineWindow(wide)
    expect(startCol).toBeLessThanOrEqual(col)
    expect(endCol).toBeGreaterThan(col)
    expect(rows[wide]).toContain("col180")
  })

  test("after a narrowing resize the terminal cursor sits on the cursor's cell, inside the row", async () => {
    const { setup, island, wide, rows } = await narrowedOnCol180()
    const { x, y, visible } = setup.renderer.getCursorState()
    expect(visible).toBe(true)
    expect(y).toBe(wide + 1)
    // The terminal counts from 1, and the last column of the pane is the scrollbar's.
    expect(x).toBeLessThan(island.width())
    expect(rows[wide]![x - 1]).toBe("1")
  })

  test("the readout is null on a line that fits", async () => {
    const { island, mapping } = await mountWide()
    island.update({ cursor: { line: lineOf(mapping, "const short"), col: 3 } })
    expect(island.columnStatus()).toBeNull()
  })

  test("the readout counts a tab as the cells it draws in, so the last character reads the total", async () => {
    const { island, mapping } = await mount({ raw: TAB_LINE, height: 8 })
    await frame()
    const line = lineOf(mapping, "const wide")
    const total = cellOfColumn(TAB_LINE_CONTENT, TAB_LINE_CONTENT.length)
    expect(total).toBe(TAB_LINE_CONTENT.length + 2)
    island.update({ cursor: { line, col: TAB_LINE_CONTENT.length - 1 } })
    expect(island.columnStatus()).toEqual({ col: total, total })
    island.update({ cursor: { line, col: 2 } })
    expect(island.columnStatus()).toEqual({ col: 5, total })
  })
})

describe("what is on screen", () => {
  test("the line under a pinned header is not among the visible lines", async () => {
    const { island, mapping } = await mount({ raw: THREE_FILES, height: 8 })
    await frame()
    island.update({ cursor: { line: lineOf(mapping, "export const zwei"), col: 0 } })
    island.scrollCursorTo("top")
    const top = island.scrollTop()
    const rows = await frame()

    expect(mapping.getLine(top - 1)?.type).toBe("file-header")
    expect(rows[0]).toContain("src/two.ts")
    expect(island.visibleLines()[0]).toBe(top + 1)
    expect(island.visibleLines()).not.toContain(top)
    expect(island.visibleRegion()!.lines).toEqual(island.visibleLines())
    expect(island.visibleFilenames()).toEqual(["src/two.ts", "src/three.ts"])
  })

  test("the files with code on screen: every one in a tall pane, those down to the bottom row in a short one", async () => {
    const tall = await mount({ raw: THREE_FILES, height: 40 })
    await frame()
    expect(tall.island.visibleFilenames()).toEqual(["src/one.ts", "src/two.ts", "src/three.ts"])
    tall.dispose()

    const short = await mount({ raw: THREE_FILES, height: 7 })
    await frame()
    // Seven rows reach two.ts's header and none of its code.
    expect(short.island.visibleFilenames()).toEqual(["src/one.ts"])
  })

  test("a collapsed file shows a header and no code, so its file is not among them", async () => {
    const { island } = await mount({ raw: THREE_FILES, height: 40, mappingOptions: { collapsedFiles: new Set(["src/two.ts"]) } })
    await frame()
    expect(island.visibleFilenames()).toEqual(["src/one.ts", "src/three.ts"])
  })

  // Narrow enough that the code overflows, so the window has somewhere to scroll.
  test("unwrapped, each line is looked at in its own section's window", async () => {
    const { island, mapping } = await mount({ raw: MIXED_DIGITS, width: 14, height: 16 })
    await frame()
    island.scrollColumnsBy(3)
    const near = lineOf(mapping, "const b = 3")
    const far = lineOf(mapping, "const d = 3")
    island.update({ cursor: { line: near, col: 3 } })

    const region = island.visibleRegion()!
    expect(region).toMatchObject({ startCol: 3, endCol: 3 + 9 })
    expect(region.windowsOf!(near)).toEqual([{ startCol: 3, endCol: 12 }])
    // Numbered past 99, so its gutter is a cell wider and its code a cell narrower.
    expect(region.windowsOf!(far)).toEqual([{ startCol: 3, endCol: 11 }])
  })

  test("wrapped, a line is looked at whole, or from the first slice the pinned header leaves showing", async () => {
    const { island, mapping } = await mount({ raw: SHORT_THEN_MANY_WRAPPED, width: 120, height: 12, wrap: true, scrollOff: 0 })
    await frame()
    const line = lineOf(mapping, "const line10 ")
    const content = mapping.getLine(line)!.content
    island.update({ cursor: { line, col: 0 } })
    island.scrollCursorTo("top")
    const rows = await frame()

    expect(rows[0]).toContain("wrapped.ts")
    expect(rows[1]).toContain("↳")
    expect(island.visibleLines()[0]).toBe(line)
    const cut = island.lineWindow(line)
    expect(cut.startCol).toBeGreaterThan(0)
    expect(cut.endCol).toBe(content.length)
    expect(island.lineWindow(line + 1)).toEqual({ startCol: 0, endCol: mapping.getLine(line + 1)!.content.length })
  })
  test("wrapped, a line cut off at the bottom edge is looked at up to its last slice on screen", async () => {
    const { island, mapping } = await mount({ raw: MANY_WRAPPED_LINES, width: 120, height: 12, mode: "single", wrap: true, scrollOff: 0 })
    await frame()
    const line = lineOf(mapping, "const line20 ")
    const content = mapping.getLine(line)!.content
    island.update({ cursor: { line, col: 0 } })
    island.scrollCursorTo("bottom")
    const rows = await frame()

    expect(island.cursorRow() - island.scrollTop()).toBe(island.viewportHeight() - 1)
    expect(rows[island.viewportHeight() - 1]).toContain("const line20 ")
    expect(island.visibleLines().at(-1)).toBe(line)
    const cut = island.lineWindow(line)
    expect(cut.startCol).toBe(0)
    expect(cut.endCol).toBeGreaterThan(0)
    expect(cut.endCol).toBeLessThan(content.length)
  })
})

/*
 * Each line's first row and, for a line that wraps once, the column its
 * second row starts at; every other column of the line lands on one of
 * the two. Every eleventh column, the last and both sides of a break are
 * tried.
 */
describe("the cursor's row", () => {
  interface Rows {
    firstRows: number[]
    breaks?: Record<number, number>
  }

  const identity = (count: number): Rows => ({ firstRows: Array.from({ length: count }, (_, line) => line) })
  // SHORT_THEN_MANY_WRAPPED at 120: the short file's eight lines, then sixty that wrap once each.
  const manyWrapped: Rows = {
    firstRows: [...Array.from({ length: 8 }, (_, line) => line), ...Array.from({ length: 60 }, (_, i) => 8 + 2 * i), 128],
    breaks: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [8 + i, i < 9 ? 110 : 111])),
  }

  const cases: [string, MountIslandOptions, Rows][] = [
    ["all files", { raw: TWO_FILES, width: 80, height: 15 }, identity(14)],
    ["three files", { raw: THREE_FILES, width: 80, height: 15 }, identity(17)],
    ["a gutter per section", { raw: MIXED_DIGITS, width: 80, height: 15 }, identity(12)],
    ["a collapsed file", { raw: TWO_FILES, height: 15, mappingOptions: { collapsedFiles: new Set(["src/greet.ts"]) } }, identity(6)],
    ["wrapped, a long line", { raw: ONE_LONG_LINE, width: 60, height: 9, wrap: true }, { firstRows: [0, 1, 2, 3, 5, 6], breaks: { 3: 54 } }],
    [
      "wrapped, two files narrow",
      { raw: TWO_FILES, width: 30, height: 39, wrap: true },
      { firstRows: [0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15], breaks: { 1: 22, 10: 16 } },
    ],
    ["wrapped, a gutter widened by wrap", { raw: SHORT_THEN_MANY_WRAPPED, width: 120, height: 19, wrap: true }, manyWrapped],
  ]

  for (const [name, options, { firstRows, breaks = {} }] of cases) {
    test(name, async () => {
      const { island, mapping } = await mount(options)
      await frame()
      expect(mapping.lineCount).toBe(firstRows.length)

      for (let line = 0; line < mapping.lineCount; line++) {
        const length = mapping.getLine(line)!.content.length
        const around = breaks[line] === undefined ? [] : [breaks[line]! - 1, breaks[line]!]
        const cols = [...Array.from({ length: Math.ceil(length / 11) }, (_, i) => i * 11), Math.max(0, length - 1), ...around]
        for (const col of new Set(cols)) {
          island.update({ cursor: { line, col } })
          const expected = firstRows[line]! + (breaks[line] !== undefined && col >= breaks[line]! ? 1 : 0)
          expect({ line, col, row: island.cursorRow() }).toEqual({ line, col, row: expected })
        }
      }
    })
  }
})

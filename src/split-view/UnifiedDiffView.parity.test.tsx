import { test, expect, describe } from "bun:test"
import {
  FAR_HUNK,
  JUST_FITS_AT_30,
  MANY_WRAPPED_LINES,
  MIXED_DIGITS,
  ONE_LONG_LINE,
  ONE_WIDE_LINE,
  SHORT_THEN_MANY_WRAPPED,
  TWO_FILES,
} from "../testing/diffs"
import { mountDiffView } from "../testing/frame"
import { bgAt, fgAt, ints } from "../testing/split-frame"
import { mountUnified } from "../testing/unified-frame"
import {
  charAt,
  except,
  rowCells,
  expectSameColours,
  screenOf,
  type At,
  type Case,
  type Screen,
} from "../testing/unified-parity"
import { theme } from "../theme"
import type { Comment, FileReviewStatus } from "../types"
import { parseDiff } from "../utils/diff-parser"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { unifiedContentWidth } from "./content-width"
import { unifiedOrigins } from "./layout"
import type { SplitSelection } from "./overlays"

/*
 * The unified view against VimDiffView, mounted on the same diff at the
 * same size under the same header row. Both mark the cursor with the
 * terminal's own, which no captured frame shows;
 * UnifiedDiffView.cursor.parity.test.tsx reads it off the renderers.
 * The sticky header stops short of the scrollbar, where VimDiffView's
 * covers the thumb, so that last cell is masked on the sticky row.
 * VimDiffView colours code through a highlighter these tests give the
 * new view no parser for, so code's foreground is compared only where
 * an overlay decides it. Tabs are left out of the corpus.
 */

async function framesOf(options: Case) {
  const old = await mountDiffView(options)
  const oldFrame = await old.frame()
  await old.dispose()
  const { wrap = false, ...rest } = options
  const fresh = await mountUnified({ ...rest, wrap, header: true })
  const freshFrame = await fresh.frame()
  await fresh.dispose()
  return { old: oldFrame, fresh: freshFrame }
}

const WIDE_ROW = 3

/** ONE_WIDE_LINE scrolled as VimDiffView scrolls to show a far column, the new view handed the same column. */
async function sideways() {
  const old = await mountDiffView({ raw: ONE_WIDE_LINE, height: 8 })
  await old.frame()
  old.view.revealColumn(WIDE_ROW, 150)
  const oldFrame = await old.frame()
  const column = old.view.getScrollBox()!.scrollLeft
  const oldScreen = { frame: oldFrame, ...screenOf(old) }
  await old.dispose()
  const fresh = await mountUnified({ raw: ONE_WIDE_LINE, height: 8, header: true, column })
  const freshScreen = { frame: await fresh.frame(), ...screenOf(fresh) }
  await fresh.dispose()
  return { column, old: oldScreen, fresh: freshScreen }
}

const comment = (id: string, side: Comment["side"], more: Partial<Comment> = {}): Comment => ({
  id,
  filename: "src/greet.ts",
  line: 2,
  side,
  body: "why?",
  createdAt: "2026-01-01T00:00:00.000Z",
  status: "local",
  ...more,
})

describe("the unified view draws what VimDiffView draws", () => {
  const cases: [string, Case][] = [
    ["all files", { raw: TWO_FILES }],
    ["a single file", { raw: TWO_FILES, mode: "single", selectedFileIndex: 0 }],
    ["the other single file", { raw: TWO_FILES, mode: "single", selectedFileIndex: 1 }],
    ["a collapsed file", { raw: TWO_FILES, mappingOptions: { collapsedFiles: new Set(["src/farewell.ts"]) } }],
    ["a hunk far down the file", { raw: FAR_HUNK }],
    ["a file per gutter width", { raw: MIXED_DIGITS }],
    [
      "comment signs and a viewed file",
      {
        raw: TWO_FILES,
        comments: [comment("right", "RIGHT"), comment("left", "LEFT")],
        fileStatuses: new Map<string, FileReviewStatus>([
          ["src/farewell.ts", { filename: "src/farewell.ts", viewed: true }],
        ]),
      },
    ],
  ]

  for (const [name, options] of cases) {
    test(name, async () => {
      const { old, fresh } = await framesOf(options)
      expect(fresh).toBe(old)
    })
  }

  // The narrow widths put a break on the last cell of a row, where one cell of wrap width decides it.
  const wrapped: [string, Case][] = [
    ["a long line", { raw: ONE_LONG_LINE, width: 60, height: 10 }],
    ["a long line, narrow", { raw: ONE_LONG_LINE, width: 25, height: 20, mode: "single", selectedFileIndex: 0 }],
    ["a long line, mid width", { raw: ONE_LONG_LINE, width: 40, height: 20, mode: "single", selectedFileIndex: 0 }],
    ["two files, a break on the last cell", { raw: TWO_FILES, width: 30, height: 40 }],
    ["a hunk far down the file, a break on the last cell", { raw: FAR_HUNK, width: 30, height: 30 }],
  ]

  for (const [name, options] of wrapped) {
    test(`wrapped, continuation markers and all: ${name}`, async () => {
      const { old, fresh } = await framesOf({ ...options, wrap: true })
      expect(old).toContain("↳")
      expect(fresh).toBe(old)
    })
  }

  // Short enough that VimDiffView draws no scrollbar, so its › sits in the pane's last column as the new view's does.
  const overflowing: [string, Case][] = [
    ["a long line", { raw: ONE_LONG_LINE, width: 60, height: 10 }],
    ["two files, narrow", { raw: TWO_FILES, width: 30, height: 20 }],
  ]

  for (const [name, options] of overflowing) {
    test(`unwrapped, a line past the edge ends in ›: ${name}`, async () => {
      const { old, fresh } = await framesOf(options)
      expect(old).toContain("›")
      expect(fresh).toBe(old)
    })
  }

  test("scrolled sideways, every line with text is marked ‹ and a line still past the edge ›", async () => {
    const { old, fresh } = await sideways()
    expect(old.frame).toContain("‹")
    expect(old.frame).toContain("›")
    expect(fresh.frame).toBe(old.frame)
  })

  // VimDiffView's scrollbar takes the last column here; its code still wraps one cell short of it.
  test("wrapped under VimDiffView's scrollbar", async () => {
    const { old, fresh } = await framesOf({ raw: FAR_HUNK, width: 30, height: 8, wrap: true })
    expect(old).toMatch(/[▀▄█]/)
    expect(fresh).toBe(old)
  })

  // Sixty lines, but over a hundred rows once wrapped: OpenTUI sizes the gutter by the rows.
  test("wrapped past 99 rows, the gutter takes another digit", async () => {
    const { old, fresh } = await framesOf({ raw: MANY_WRAPPED_LINES, width: 120, height: 40, wrap: true })
    expect(old).toContain("    1 const line1")
    expect(fresh).toBe(old)
  })

  test("wrapped past 99 rows in one section only, only that section's gutter widens", async () => {
    const { old, fresh } = await framesOf({ raw: SHORT_THEN_MANY_WRAPPED, width: 120, height: 40, wrap: true })
    expect(old).toContain("   1 const first = 1")
    expect(old).not.toContain("    1 const first = 1")
    expect(old).toContain("    1 const line1")
    expect(fresh).toBe(old)
  })

  test("wrapped one cell short of 100 rows, the gutter widens only when it must", async () => {
    for (const width of [30, 29]) {
      const { old, fresh } = await framesOf({ raw: JUST_FITS_AT_30, width, height: 8, wrap: true })
      expect(fresh).toBe(old)
    }
  })
})

describe("the unified view draws VimDiffView's scrollbar", () => {
  const THUMB = /[▀▄█]/

  /** Both views scrolled to `scrollTop`, or as near it as VimDiffView's scrollBox lets it go. */
  async function scrolledScreensOf(options: Case, scrollTop: number) {
    const old = await mountDiffView(options)
    await old.frame()
    old.view.getScrollBox()!.scrollTop = scrollTop
    // A third pass: the post-process fills the sticky header's texts after the frame that shows it, and the next lays them out.
    await old.frame()
    await old.setup.renderOnce()
    const scrolledTo = old.view.getScrollBox()!.scrollTop
    const oldScreen = screenOf(old)
    await old.dispose()
    const { wrap = false, ...rest } = options
    const fresh = await mountUnified({ ...rest, wrap, header: true, scrollTop: scrolledTo })
    await fresh.frame()
    const freshScreen = screenOf(fresh)
    await fresh.dispose()
    return { old: oldScreen, fresh: freshScreen, scrolledTo }
  }

  const lastColumn = (screen: Screen) => screen.rows.map((row) => row.at(-1))
  // The char frame ends in a newline, so its rows run one past the screen's.
  const lastColumnCells = (screen: Screen) =>
    screen.spans.lines.map((_, y): At => [screen.rows[y]!.length - 1, y])
  const cellOf = (screen: Screen, [x, y]: At) => [charAt(screen, [x, y]), fgAt(screen.spans, x, y), bgAt(screen.spans, x, y)]

  // The row VimDiffView pins a scrolled-away file's header over, under the header row.
  const STICKY_ROW = 1
  const lastCellOf = (screen: Screen): At => [screen.rows[STICKY_ROW]!.length - 1, STICKY_ROW]
  const withoutLastCell = (screen: Screen) => screen.rows[STICKY_ROW]!.slice(0, -1)

  /** The sticky row alike in glyphs and colours, but for the scrollbar's cell VimDiffView covers. */
  function expectSameStickyRow(old: Screen, fresh: Screen) {
    expect(withoutLastCell(fresh)).toBe(withoutLastCell(old))
    const cells = except(rowCells([STICKY_ROW], old.rows[STICKY_ROW]!.length), lastCellOf(old))
    expectSameColours(old, fresh, [], cells)
    expect(cells.map((at) => fgAt(fresh.spans, ...at))).toEqual(cells.map((at) => fgAt(old.spans, ...at)))
  }

  for (const height of [8, 6]) {
    test(`two files at 80x${height}, from the top to the last scroll position`, async () => {
      const tops = []
      for (const scrollTop of [0, 4, Number.MAX_SAFE_INTEGER]) {
        const { old, fresh, scrolledTo } = await scrolledScreensOf({ raw: TWO_FILES, width: 80, height }, scrollTop)
        tops.push(scrolledTo)
        expect(lastColumn(old).join("")).toMatch(THUMB)
        if (scrolledTo === 0) {
          expect(fresh.rows).toEqual(old.rows)
          continue
        }
        expect(fresh.rows.filter((_, y) => y !== STICKY_ROW)).toEqual(old.rows.filter((_, y) => y !== STICKY_ROW))
        // VimDiffView's divider overlay paints over its sticky header when the divider is the top row; the new view keeps the file's name there.
        if (old.rows[STICKY_ROW]!.includes("rest of the file")) {
          expect(fresh.rows[STICKY_ROW]!.trimEnd()).toBe(" ▼   src/greet.ts +2 -1")
          continue
        }
        expect(old.rows[STICKY_ROW]).toMatch(/^ ▼   src\/\w+\.ts \+\d -\d/)
        const bar = except(lastColumnCells(old), lastCellOf(old))
        expect(bar.map((at) => cellOf(fresh, at))).toEqual(bar.map((at) => cellOf(old, at)))
        expectSameStickyRow(old, fresh)
      }
      // Mid-way and at the end, so the thumb is held at three places.
      expect(tops[1]).toBe(4)
      expect(tops[2]).toBeGreaterThan(4)
    })
  }

  test("the decided difference: the sticky header leaves the thumb on its row in sight, where VimDiffView covers it", async () => {
    const { old, fresh, scrolledTo } = await scrolledScreensOf({ raw: JUST_FITS_AT_30, width: 47, height: 5 }, 3)
    expect(scrolledTo).toBe(3)
    expect(charAt(old, lastCellOf(old))).toBe(" ")
    expect(charAt(fresh, lastCellOf(fresh))).toMatch(THUMB)
    expect(old.rows[STICKY_ROW]).toContain("tight.ts")
    expectSameStickyRow(old, fresh)
  })

  test("the sticky header over a file with a wider gutter, the scrollbar's cell masked", async () => {
    const { old, fresh, scrolledTo } = await scrolledScreensOf({ raw: MIXED_DIGITS, width: 40, height: 6 }, 1)
    expect(scrolledTo).toBe(1)
    expect(old.rows[STICKY_ROW]).toContain("short.ts")
    expectSameStickyRow(old, fresh)
    expect(fresh.rows.slice(STICKY_ROW + 1)).toEqual(old.rows.slice(STICKY_ROW + 1))
  })

  // VimDiffView's code ends a column short of its scrollbar, so the › sits beside it while the bar is on screen.
  test("an unwrapped line past the edge ends in a › beside the scrollbar", async () => {
    const { old, fresh } = await framesOf({ raw: ONE_LONG_LINE, width: 60, height: 5 })
    const rows = old.split("\n")
    expect(rows[4]![58]).toBe("›")
    expect(rows.join("")).toMatch(THUMB)
    expect(fresh).toBe(old)
  })

  // VimDiffView's ScrollBox shrinks its bar in proportion to the content, so code nearly twice the pane wide rounds it off screen.
  const pushedOff: [string, Case, boolean][] = [
    ["a long line at 40 columns", { raw: ONE_LONG_LINE, width: 40, height: 5 }, false],
    ["a long line at 49 columns", { raw: ONE_LONG_LINE, width: 49, height: 5 }, false],
    ["a long line at 50 columns", { raw: ONE_LONG_LINE, width: 50, height: 5 }, true],
    ["a wide line at 30 columns", { raw: ONE_WIDE_LINE, width: 30, height: 5 }, false],
    ["a wide line at 91 columns", { raw: ONE_WIDE_LINE, width: 91, height: 5 }, false],
    ["a wide line at 92 columns", { raw: ONE_WIDE_LINE, width: 92, height: 5 }, true],
    ["many long lines at 40x12", { raw: MANY_WRAPPED_LINES, width: 40, height: 12 }, false],
    ["many long lines at 80x20", { raw: MANY_WRAPPED_LINES, width: 80, height: 20 }, false],
    ["many long lines at 81x20", { raw: MANY_WRAPPED_LINES, width: 81, height: 20 }, true],
    ["a short file, then many long lines, at 40x12", { raw: SHORT_THEN_MANY_WRAPPED, width: 40, height: 12 }, false],
  ]

  for (const [name, options, shows] of pushedOff) {
    test(`unwrapped, the scrollbar ${shows ? "stays" : "is pushed off screen"}: ${name}`, async () => {
      const { old, fresh } = await framesOf(options)
      const lastCells = old.split("\n").slice(1).map((row) => row[options.width! - 1] ?? " ").join("")
      expect(THUMB.test(lastCells)).toBe(shows)
      if (!shows) expect(lastCells).toContain("›")
      expect(fresh).toBe(old)
    })
  }

  test("measures unwrapped content as VimDiffView's ScrollBox lays it out", async () => {
    const corpus = { FAR_HUNK, JUST_FITS_AT_30, MANY_WRAPPED_LINES, MIXED_DIGITS, ONE_LONG_LINE, ONE_WIDE_LINE, SHORT_THEN_MANY_WRAPPED, TWO_FILES }
    // Narrow enough that every diff's content outgrows the pane, past the 100% floor VimDiffView gives it.
    const width = 12
    for (const [name, raw] of Object.entries(corpus)) {
      for (const mode of ["all", "single"] as const) {
        // At 12 columns MIXED_DIGITS's headers outgrow its code, and the measure leaves headers out.
        if (name === "MIXED_DIGITS" && mode === "all") continue
        const selectedFileIndex = mode === "single" ? 0 : null
        const old = await mountDiffView({ raw, width, height: 5, mode, selectedFileIndex })
        await old.frame()
        const laidOut = old.view.getScrollBox()!.content.width
        await old.dispose()
        const mapping = new DiffLineMapping(parseDiff(raw), mode, selectedFileIndex ?? undefined)
        const measured = unifiedContentWidth(mapping.allLines, unifiedOrigins(mapping))
        expect({ name, mode, width: measured }).toEqual({ name, mode, width: laidOut })
      }
    }
  })

  test("the track and thumb colours", async () => {
    const { old, fresh } = await scrolledScreensOf({ raw: TWO_FILES, width: 80, height: 8 }, 0)
    // Under the header row, down the view's seven rows.
    const column = [1, 2, 3, 4, 5, 6, 7].map((y): At => [79, y])
    const cellsOf = (screen: Screen) => column.map(([x, y]) => [charAt(screen, [x, y]), fgAt(screen.spans, x, y), bgAt(screen.spans, x, y)])
    expect(cellsOf(fresh)).toEqual(cellsOf(old))
    expectSameColours(old, fresh, [], column)
    const thumb = column.find((at) => THUMB.test(charAt(fresh, at)!))!
    expect(fgAt(fresh.spans, ...thumb)).toEqual(ints(theme.surface2))
    expect(bgAt(fresh.spans, ...column.find((at) => charAt(fresh, at) === " ")!)).toEqual(ints(theme.surface0))
  })
})

describe("the unified view colours a line as VimDiffView does", () => {
  // TWO_FILES under the header row: each mapping line sits one screen row down.
  const CONTEXT = 1
  const DELETION = 2
  const ADDITION = 3
  const CURSOR = 4
  const SELECTED = 5
  const DIVIDER = 7
  const SPACING = 8
  // Both gutter edges, the first cell of code and one well past the end of every line.
  const CELLS = [0, 4, 5, 70]

  async function colours(
    cursorLine: number,
    anchor: number | null,
    lines: number[],
    { expandingDivider = null }: { expandingDivider?: string | null } = {}
  ) {
    const old = await mountDiffView({ raw: TWO_FILES, expandingDivider })
    old.cursor.line = cursorLine
    if (anchor !== null) Object.assign(old.cursor, { mode: "visual-line", selectionAnchor: anchor })
    old.view.updateCursor(old.cursor)
    await old.frame()
    const selection: SplitSelection | null =
      anchor === null
        ? null
        : {
            mode: "visual-line",
            startRow: Math.min(anchor, cursorLine),
            endRow: Math.max(anchor, cursorLine),
            startCol: 0,
            endCol: 0,
          }
    const fresh = await mountUnified({
      raw: TWO_FILES,
      header: true,
      cursor: { line: cursorLine },
      selection,
      expandingDivider,
    })
    await fresh.frame()
    const read = (setup: typeof old.setup) => {
      const spans = setup.captureSpans()
      return lines.map((line) => CELLS.map((x) => ({ line, x, bg: bgAt(spans, x, line + 1) })))
    }
    const result = { old: read(old.setup), fresh: read(fresh.setup) }
    await old.dispose()
    await fresh.dispose()
    return result
  }

  test("context, deletion, addition and the cursor line", async () => {
    const { old, fresh } = await colours(CURSOR, null, [CONTEXT, DELETION, ADDITION, CURSOR, DIVIDER, SPACING])
    expect(fresh).toEqual(old)
  })

  test("a linewise selection", async () => {
    const { old, fresh } = await colours(SELECTED + 1, SELECTED, [CONTEXT, SELECTED, SELECTED + 1])
    expect(fresh).toEqual(old)
  })

  test("the cursor on a spacing row", async () => {
    const { old, fresh } = await colours(SPACING, null, [SPACING])
    expect(fresh).toEqual(old)
  })

  test("the cursor on a divider", async () => {
    const { old, fresh } = await colours(DIVIDER, null, [DIVIDER])
    expect(fresh).toEqual(old)
  })

  describe("a divider while it expands", () => {
    const expandingDivider = () => {
      const files = parseDiff(TWO_FILES)
      return new DiffLineMapping(files, "all").getLine(DIVIDER)!.dividerKey!
    }

    test("with the cursor elsewhere", async () => {
      const { old, fresh } = await colours(CURSOR, null, [DIVIDER], { expandingDivider: expandingDivider() })
      expect(fresh).toEqual(old)
    })

    test("with the cursor on it", async () => {
      const { old, fresh } = await colours(DIVIDER, null, [DIVIDER], { expandingDivider: expandingDivider() })
      expect(fresh).toEqual(old)
    })
  })
})

describe("the unified view colours a comment's sign as VimDiffView does", () => {
  // Screen rows under the header: greet.ts's lines from 1, farewell.ts's from 11.
  const signed: [Comment, number][] = [
    [comment("local", "LEFT"), 3],
    [comment("pending", "RIGHT", { status: "pending" }), 4],
    [comment("synced", "RIGHT", { line: 1, status: "synced" }), 2],
    [comment("edited", "RIGHT", { filename: "src/farewell.ts", line: 1, status: "synced", localEdit: "why not?" }), 11],
    [comment("resolved", "RIGHT", { filename: "src/farewell.ts", line: 2, status: "synced", isThreadResolved: true }), 12],
  ]

  test("local, pending, synced, edited and resolved", async () => {
    const comments = signed.map(([c]) => c)
    const old = await mountDiffView({ raw: TWO_FILES, comments })
    await old.frame()
    const fresh = await mountUnified({ raw: TWO_FILES, header: true, comments })
    await fresh.frame()
    const read = (setup: typeof old.setup) => {
      const spans = setup.captureSpans()
      return signed.map(([c, y]) => ({ id: c.id, char: setup.captureCharFrame().split("\n")[y]![0], fg: fgAt(spans, 0, y) }))
    }
    const result = { old: read(old.setup), fresh: read(fresh.setup) }
    await old.dispose()
    await fresh.dispose()
    expect(result.old.every(({ char }) => char === "●")).toBe(true)
    expect(new Set(result.old.map(({ fg }) => String(fg))).size).toBe(4)
    expect(result.fresh).toEqual(result.old)
  })
})

describe("the unified view colours its markers as VimDiffView does", () => {
  async function screensOf(options: Case): Promise<{ old: Screen; fresh: Screen }> {
    const old = await mountDiffView(options)
    await old.frame()
    const oldScreen = screenOf(old)
    await old.dispose()
    const { wrap = false, ...rest } = options
    const fresh = await mountUnified({ ...rest, wrap, header: true })
    await fresh.frame()
    const freshScreen = screenOf(fresh)
    await fresh.dispose()
    return { old: oldScreen, fresh: freshScreen }
  }

  // ONE_LONG_LINE under the header row: its addition is screen row 4, and wrapped at 60 it carries on into row 5.
  const ADDITION_ROW = 4
  const gutterOf = (y: number): At[] => [0, 1, 2, 3, 4, 5].map((x): At => [x, y])

  test("the › ending an addition line", async () => {
    const { old, fresh } = await screensOf({ raw: ONE_LONG_LINE, width: 60, height: 10 })
    expect(charAt(old, [59, ADDITION_ROW])).toBe("›")
    expectSameColours(old, fresh, [[59, ADDITION_ROW]], [[58, ADDITION_ROW]])
  })

  // The wide line's code is one changed word, which VimDiffView tints only through its
  // highlighter, and that never runs under the test renderer: its code is left out here.
  test("the ‹ on a context line, a deletion and an addition", async () => {
    const { column, old, fresh } = await sideways()
    expect(column).toBeGreaterThan(0)
    const rows = [2, 3, 4]
    const markers = rows.map((y): At => [4, y])
    expect(markers.map((at) => charAt(old, at))).toEqual(["‹", "‹", "‹"])
    expectSameColours(old, fresh, markers, [...rows.map((y): At => [3, y]), [5, 2], [5, 3]])
  })

  // A continuation row's gutter is coloured as its line's first row is, in both views.
  test("the ↳ and the gutter around it on a wrapped addition line", async () => {
    const { old, fresh } = await screensOf({ raw: ONE_LONG_LINE, width: 60, height: 10, wrap: true })
    const marker: At = [4, ADDITION_ROW + 1]
    expect(charAt(old, marker)).toBe("↳")
    expectSameColours(old, fresh, [marker], except([...gutterOf(ADDITION_ROW), ...gutterOf(ADDITION_ROW + 1)], marker))
  })

  // TWO_FILES at 30 wraps greet.ts's first line, a line of context on screen row 2.
  test("the ↳ and the gutter around it on a wrapped context line", async () => {
    const { old, fresh } = await screensOf({ raw: TWO_FILES, width: 30, height: 40, wrap: true })
    const marker: At = [4, 3]
    expect(charAt(old, marker)).toBe("↳")
    expectSameColours(old, fresh, [marker], except([...gutterOf(2), ...gutterOf(3)], marker))
  })
})

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
import { mountDiffView, type MountDiffViewOptions } from "../testing/frame"
import { SYNTAX_PALETTE } from "../diff-rows/syntax-palette"
import { bgAt, fgAt, ints } from "../testing/split-frame"
import { theme } from "../theme"
import { mountUnified } from "../testing/unified-frame"
import type { Comment, FileReviewStatus } from "../types"
import { parseDiff } from "../utils/diff-parser"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SplitSelection } from "./overlays"

/*
 * The unified view against VimDiffView, mounted on the same diff at the
 * same size under the same header row. The new view does not draw
 * VimDiffView's cursor cell, sticky header or scrollbar yet, so the cases
 * here stay clear of them or mask them. VimDiffView colours code through a
 * highlighter these tests give the new view no parser for, so code's
 * foreground is compared only where an overlay decides it. Tabs are left
 * out of the corpus.
 */

type Case = Omit<MountDiffViewOptions, "selectedFileIndex"> & { selectedFileIndex?: number }

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
  const oldSpans = old.setup.captureSpans()
  await old.dispose()
  const fresh = await mountUnified({ raw: ONE_WIDE_LINE, height: 8, header: true, column })
  const freshFrame = await fresh.frame()
  const freshSpans = fresh.setup.captureSpans()
  await fresh.dispose()
  return { column, old: { frame: oldFrame, spans: oldSpans }, fresh: { frame: freshFrame, spans: freshSpans } }
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

  const withoutLastColumn = (frame: string, width: number) =>
    frame
      .split("\n")
      .map((row) => row.slice(0, width - 1).trimEnd())
      .join("\n")

  // VimDiffView's scrollbar takes the last column here; its code still wraps one cell short of it.
  test("wrapped under VimDiffView's scrollbar, but for the scrollbar's column", async () => {
    const { old, fresh } = await framesOf({ raw: FAR_HUNK, width: 30, height: 8, wrap: true })
    expect(old).toMatch(/[▀▄█]/)
    expect(withoutLastColumn(fresh, 30)).toBe(withoutLastColumn(old, 30))
  })

  // Sixty lines, but over a hundred rows once wrapped: OpenTUI sizes the gutter by the rows.
  test("wrapped past 99 rows, the gutter takes another digit", async () => {
    const { old, fresh } = await framesOf({ raw: MANY_WRAPPED_LINES, width: 120, height: 40, wrap: true })
    expect(old).toContain("    1 const line1")
    expect(withoutLastColumn(fresh, 120)).toBe(withoutLastColumn(old, 120))
  })

  test("wrapped past 99 rows in one section only, only that section's gutter widens", async () => {
    const { old, fresh } = await framesOf({ raw: SHORT_THEN_MANY_WRAPPED, width: 120, height: 40, wrap: true })
    expect(old).toContain("   1 const first = 1")
    expect(old).not.toContain("    1 const first = 1")
    expect(old).toContain("    1 const line1")
    expect(withoutLastColumn(fresh, 120)).toBe(withoutLastColumn(old, 120))
  })

  test("wrapped one cell short of 100 rows, the gutter widens only when it must", async () => {
    for (const width of [30, 29]) {
      const { old, fresh } = await framesOf({ raw: JUST_FITS_AT_30, width, height: 8, wrap: true })
      expect(withoutLastColumn(fresh, width)).toBe(withoutLastColumn(old, width))
    }
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
  // VimDiffView paints its cursor cell over the first column of the cursor line.
  const CURSOR_CELLS = [0, 4, 10, 70]

  // Clear of x=5, where VimDiffView paints its cursor cell at the code's first column even on a chrome row.
  const GUTTER_CELLS = [0, 1, 4, 70]

  async function colours(
    cursorLine: number,
    anchor: number | null,
    lines: number[],
    { expandingDivider = null, cells }: { expandingDivider?: string | null; cells?: number[] } = {}
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
      return lines.map((line) =>
        (cells ?? (line === cursorLine ? CURSOR_CELLS : CELLS)).map((x) => ({ line, x, bg: bgAt(spans, x, line + 1) }))
      )
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
    const { old, fresh } = await colours(SPACING, null, [SPACING], { cells: GUTTER_CELLS })
    expect(fresh).toEqual(old)
  })

  test("the cursor on a divider", async () => {
    const { old, fresh } = await colours(DIVIDER, null, [DIVIDER], { cells: GUTTER_CELLS })
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
      const { old, fresh } = await colours(DIVIDER, null, [DIVIDER], {
        expandingDivider: expandingDivider(),
        cells: GUTTER_CELLS,
      })
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
  type At = [x: number, y: number]
  type Spans = ReturnType<Awaited<ReturnType<typeof mountDiffView>>["setup"]["captureSpans"]>
  interface Screen {
    frame: string
    spans: Spans
  }

  const charAt = (screen: Screen, [x, y]: At) => screen.frame.split("\n")[y]![x]

  /*
   * VimDiffView's drawMarker hands OpenTUI's 16-bit colour channels to
   * RGBA.fromValues, which takes 0..1, so its marker cells come out white.
   * What it means to keep is the background the cell already had, the one
   * the cell to its left still shows; the new view is held to that.
   */
  function expectSameColours(old: Screen, fresh: Screen, markers: At[], plain: At[]) {
    expect(markers.map((at) => [charAt(fresh, at), fgAt(fresh.spans, ...at), bgAt(fresh.spans, ...at)])).toEqual(
      markers.map(([x, y]) => [charAt(old, [x, y]), fgAt(old.spans, x, y), bgAt(old.spans, x - 1, y)])
    )
    expect(plain.map((at) => bgAt(fresh.spans, ...at))).toEqual(plain.map((at) => bgAt(old.spans, ...at)))
  }

  async function screensOf(options: Case): Promise<{ old: Screen; fresh: Screen }> {
    const old = await mountDiffView(options)
    await old.frame()
    const oldScreen = { frame: old.setup.captureCharFrame(), spans: old.setup.captureSpans() }
    await old.dispose()
    const { wrap = false, ...rest } = options
    const fresh = await mountUnified({ ...rest, wrap, header: true })
    await fresh.frame()
    const freshScreen = { frame: fresh.setup.captureCharFrame(), spans: fresh.setup.captureSpans() }
    await fresh.dispose()
    return { old: oldScreen, fresh: freshScreen }
  }

  // ONE_LONG_LINE under the header row: its addition is screen row 4, and wrapped at 60 it carries on into row 5.
  const ADDITION_ROW = 4
  const gutterOf = (y: number): At[] => [0, 1, 2, 3, 4, 5].map((x): At => [x, y])
  const except = (cells: At[], [mx, my]: At) => cells.filter(([x, y]) => x !== mx || y !== my)

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

describe("the unified view overlays search, a selection and flash as VimDiffView does", () => {
  type At = [x: number, y: number]
  type Mounted = Awaited<ReturnType<typeof mountDiffView>>
  type Rgba = number[] | undefined
  interface Screen {
    rows: string[]
    spans: ReturnType<Mounted["setup"]["captureSpans"]>
  }
  /** Where both views put the cursor; with an anchor, VimDiffView is in charwise visual mode from it. */
  interface Cursor {
    line: number
    col: number
    anchor?: { line: number; col: number }
  }
  interface Setup {
    cursor?: Cursor
    /** A line's column VimDiffView scrolls to; the new view is handed the column it lands on. */
    reveal?: { line: number; col: number }
    /** Colours VimDiffView's highlighter brings; a search's unless told otherwise. */
    highlighted?: Rgba[]
  }

  const sameRgba = (a: Rgba, b: Rgba) => JSON.stringify(a) === JSON.stringify(b)
  const SEARCH_BGS = [ints(SYNTAX_PALETTE["search.match"]!.bg!), ints(SYNTAX_PALETTE["search.current"]!.bg!)]
  const FLASH_BGS = [ints(theme.surface1), ints(theme.red)]
  const WORD_BGS = [ints(SYNTAX_PALETTE["diff.word.removed"]!.bg!), ints(SYNTAX_PALETTE["diff.word.added"]!.bg!)]

  function selectionOf(cursor: Cursor | undefined): SplitSelection | null {
    if (!cursor?.anchor) return null
    const { anchor } = cursor
    const anchorFirst = anchor.line < cursor.line || (anchor.line === cursor.line && anchor.col <= cursor.col)
    const [start, end] = anchorFirst ? [anchor, cursor] : [cursor, anchor]
    return { mode: "visual", startRow: start.line, startCol: start.col, endRow: end.line, endCol: end.col }
  }

  // VimDiffView injects search and word diffs through its highlighter, whose parse lands a frame or more after the first.
  async function untilHighlighted(old: Mounted, bgs: Rgba[]) {
    for (let tries = 0; tries < 60; tries++) {
      await old.frame()
      const { lines } = old.setup.captureSpans()
      if (lines.some((line) => line.spans.some((span) => bgs.some((bg) => sameRgba(span.bg.toInts(), bg))))) return
      await Bun.sleep(50)
    }
    throw new Error("VimDiffView's highlighter never drew")
  }

  async function screensOf(options: Case, { cursor, reveal, highlighted }: Setup = {}) {
    const old = await mountDiffView(options)
    if (cursor) {
      Object.assign(old.cursor, { line: cursor.line, col: cursor.col })
      if (cursor.anchor) {
        Object.assign(old.cursor, { mode: "visual", selectionAnchor: cursor.anchor.line, selectionAnchorCol: cursor.anchor.col })
      }
      old.view.updateCursor(old.cursor)
    }
    await old.frame()
    if (reveal !== undefined) {
      old.view.revealColumn(reveal.line, reveal.col)
      await old.frame()
    }
    const awaited = highlighted ?? (options.search ? SEARCH_BGS : null)
    if (awaited) await untilHighlighted(old, awaited)
    const column = old.view.getScrollBox()!.scrollLeft
    const oldScreen = { rows: old.setup.captureCharFrame().split("\n"), spans: old.setup.captureSpans() }
    await old.dispose()
    const { wrap = false, ...rest } = options
    const fresh = await mountUnified({
      ...rest,
      wrap,
      header: true,
      column,
      cursor: { line: cursor?.line ?? 0 },
      selection: selectionOf(cursor),
    })
    await fresh.frame()
    const freshScreen = { rows: fresh.setup.captureCharFrame().split("\n"), spans: fresh.setup.captureSpans() }
    await fresh.dispose()
    return { old: oldScreen as Screen, fresh: freshScreen as Screen, column }
  }

  const rowCells = (ys: number[], width: number): At[] =>
    ys.flatMap((y) => Array.from({ length: width }, (_, x): At => [x, y]))
  const except = (cells: At[], ...masked: At[]) => cells.filter(([x, y]) => !masked.some(([mx, my]) => mx === x && my === y))

  /*
   * Glyph and background on every cell, the foreground only on a glyph and
   * only where `fgOn` says both views choose it alone: VimDiffView's code is white or its
   * highlighter's colours, the new view's is uncoloured by any parser here.
   * Only the cells that differ are listed, so a failure reads short.
   */
  function expectSame(old: Screen, fresh: Screen, cells: At[], fgOn: (at: At, oldBg: Rgba) => boolean) {
    expect(fresh.rows.map((r) => r.trimEnd())).toEqual(old.rows.map((r) => r.trimEnd()))
    const cellOf = (screen: Screen, [x, y]: At, withFg: boolean) => {
      const char = screen.rows[y]![x]
      const fg = withFg && char !== " " ? fgAt(screen.spans, x, y) : null
      return JSON.stringify({ x, y, char, bg: bgAt(screen.spans, x, y), fg })
    }
    const differing = cells.flatMap((at) => {
      const withFg = fgOn(at, bgAt(old.spans, ...at))
      const [was, is] = [cellOf(old, at, withFg), cellOf(fresh, at, withFg)]
      return was === is ? [] : [{ old: was, fresh: is }]
    })
    expect(differing).toEqual([])
  }

  /** The gutter, riff's own rows and any cell an overlay colours outright. */
  const decided =
    (gutter: number, chrome: number[], overlayBgs: Rgba[]) =>
    ([x, y]: At, bg: Rgba) =>
      x < gutter || chrome.includes(y) || overlayBgs.some((overlay) => sameRgba(bg, overlay))

  const matchesOf = (raw: string, word: string) => {
    const mapping = new DiffLineMapping(parseDiff(raw), "all")
    return mapping.allLines.flatMap((line, index) => {
      if (line.type !== "context" && line.type !== "addition" && line.type !== "deletion") return []
      const found = []
      for (let at = line.content.indexOf(word); at >= 0; at = line.content.indexOf(word, at + 1)) {
        found.push({ line: index, startCol: at, endCol: at + word.length })
      }
      return found
    })
  }

  // Screen rows of TWO_FILES under the header: each mapping line one down.
  const TWO_FILES_CHROME = [1, 8, 9, 10, 14]
  // The code's first column in every diff here.
  const GUTTER = 5

  // Neither the file search nor the mapping's yields a match off a line of code, so none sits on a header or divider.
  describe("search", () => {
    test("several matches, one of them current", async () => {
      const matches = matchesOf(TWO_FILES, "name")
      expect(matches.length).toBe(5)
      const { old, fresh } = await screensOf({ raw: TWO_FILES, search: { matches, current: 2 } })
      expectSame(old, fresh, rowCells([2, 3, 4, 5, 11, 12], 79), decided(GUTTER, [], SEARCH_BGS))
    })

    test("a match across a wrapped line's break", async () => {
      // The addition's first row breaks after "going" and before "a fairly".
      const matches = matchesOf(ONE_LONG_LINE, "keeps going a fairly")
      expect(matches.length).toBe(1)
      const options = { raw: ONE_LONG_LINE, width: 60, height: 10, wrap: true, search: { matches, current: 0 } }
      const { old, fresh } = await screensOf(options)
      expect(old.rows[5]![4]).toBe("↳")
      // The ↳ is VimDiffView's white marker cell, held to its intended colours above.
      const cells = except(rowCells([4, 5, 6], 59), [4, 5])
      expect(bgAt(fresh.spans, 58, 4)).toEqual(SEARCH_BGS[1])
      expect(bgAt(fresh.spans, 47, 4)).not.toEqual(SEARCH_BGS[1])
      expect(bgAt(fresh.spans, 5, 5)).toEqual(SEARCH_BGS[1])
      expectSame(old, fresh, cells, decided(GUTTER, [], SEARCH_BGS))
    })

    // VimDiffView's highlighter ranks a changed word above a hit, so this stays on lines no word diff touches.
    test("a match partly left of a line scrolled sideways", async () => {
      const options = { raw: TWO_FILES, width: 30, height: 20 }
      const reveal = { line: 1, col: 36 }
      const { column } = await screensOf(options, { reveal })
      expect(column).toBeGreaterThan(2)
      const search = {
        matches: [
          { line: 1, startCol: column - 2, endCol: column + 3 },
          { line: 6, startCol: column + 1, endCol: column + 4 },
        ],
        current: 1,
      }
      const { old, fresh } = await screensOf({ ...options, search }, { reveal })
      // Only the rows with a hit: past the widest line VimDiffView leaves a tinted row untinted once scrolled.
      // Each row's ‹ is VimDiffView's white marker cell.
      const cells = except(rowCells([2, 7], 29), [4, 2], [4, 7])
      expect(bgAt(fresh.spans, GUTTER + 2, 2)).toEqual(SEARCH_BGS[0])
      expect(bgAt(fresh.spans, GUTTER + 3, 2)).not.toEqual(SEARCH_BGS[0])
      expectSame(old, fresh, cells, decided(GUTTER, [], SEARCH_BGS))
    })
  })

  // Selection leaves the foreground alone, so only the gutter's and riff's own rows' are compared.
  describe("a charwise selection", () => {
    test("from mid-line over a divider, spacing and a file header to mid-line", async () => {
      const cursor = { line: 10, col: 9, anchor: { line: 6, col: 7 } }
      const { old, fresh } = await screensOf({ raw: TWO_FILES }, { cursor })
      // The cursor's own cells are VimDiffView's to paint, in a later step.
      const cells = except(rowCells([7, 8, 9, 10, 11], 79), [GUTTER, 11], [GUTTER + cursor.col, 11])
      expect(bgAt(fresh.spans, GUTTER + 7, 7)).toEqual(ints(theme.surface1))
      expect(bgAt(fresh.spans, GUTTER + 6, 7)).not.toEqual(ints(theme.surface1))
      expect(bgAt(fresh.spans, GUTTER + 7, 8)).not.toEqual(ints(theme.surface1))
      expectSame(old, fresh, cells, decided(GUTTER, TWO_FILES_CHROME, []))
    })

    test("over a wrapped line", async () => {
      const cursor = { line: 4, col: 0, anchor: { line: 3, col: 20 } }
      const { old, fresh } = await screensOf({ raw: ONE_LONG_LINE, width: 60, height: 10, wrap: true }, { cursor })
      const cells = except(rowCells([4, 5, 6], 59), [4, 5], [GUTTER, 6])
      expect(bgAt(fresh.spans, 40, 5)).toEqual(ints(theme.surface1))
      expectSame(old, fresh, cells, decided(GUTTER, [], []))
    })
  })

  describe("flash", () => {
    const labelled = (matches: { line: number; startCol: number; endCol: number }[], unlabelled = -1) =>
      matches.map((match, i) => ({ ...match, label: i === unlabelled ? null : "asdfghjkl"[i]! }))

    test("matches, labels and a match past the alphabet on lines of code; the backdrop on riff's own rows too", async () => {
      const flash = labelled(matchesOf(TWO_FILES, "name"), 1)
      const { old, fresh } = await screensOf({ raw: TWO_FILES, flash }, { highlighted: WORD_BGS })
      const cells = rowCells([1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14], 79)
      // The backdrop dims from the code's column, so the gutter keeps its colours.
      expect(fgAt(fresh.spans, 3, 2)).toEqual(ints(theme.overlay0))
      expect(fgAt(fresh.spans, 1, 1)).toEqual(ints(theme.overlay0))
      expectSame(old, fresh, cells, decided(GUTTER, TWO_FILES_CHROME, FLASH_BGS))
    })

    test("a match and its label on a wrapped line's continuation row", async () => {
      const flash = labelled(matchesOf(ONE_LONG_LINE, "keeps going"))
      const { old, fresh } = await screensOf({ raw: ONE_LONG_LINE, width: 60, height: 10, wrap: true, flash })
      const continuation = rowCells([5], 59).filter(([x, y]) => sameRgba(bgAt(old.spans, x, y), ints(theme.red)))
      expect(continuation.length).toBe(1)
      expectSame(old, fresh, except(rowCells([1, 2, 3, 4, 5, 6, 7], 59), [4, 5]), decided(GUTTER, [1, 7], FLASH_BGS))
    })

    test("a label on each file header's path", async () => {
      const flash = [
        { line: 0, startCol: 4, endCol: 9, label: "a" },
        { line: 9, startCol: 0, endCol: 3, label: "s" },
      ]
      const { old, fresh } = await screensOf({ raw: TWO_FILES, flash })
      expect(old.rows[1]![9]).toBe("a")
      expect(old.rows[10]![5]).toBe("s")
      expectSame(old, fresh, rowCells([1, 10], 79), decided(GUTTER, [1, 10], FLASH_BGS))
    })
  })
})

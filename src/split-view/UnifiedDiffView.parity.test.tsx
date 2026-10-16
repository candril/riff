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
import { bgAt, fgAt } from "../testing/split-frame"
import { mountUnified } from "../testing/unified-frame"
import {
  charAt,
  except,
  expectSameColours,
  screenOf,
  type At,
  type Case,
  type Screen,
} from "../testing/unified-parity"
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

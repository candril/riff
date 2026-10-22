import { test, expect, describe, afterEach } from "bun:test"
import { ADDITION_BG, CURSOR_LINE_BG, DELETION_BG } from "../diff-rows/line-colors"
import { SYNTAX_PALETTE } from "../diff-rows/syntax-palette"
import { ONE_LONG_LINE, ONE_WIDE_LINE, TWO_FILES } from "../testing/diffs"
import { charAt, screenOf, type At } from "../testing/screen"
import { bgAt, fgAt, ints } from "../testing/split-frame"
import { mountUnified, type MountUnifiedOptions } from "../testing/unified-frame"
import { colors, theme } from "../theme"
import type { Comment } from "../types"
import { parseDiff } from "../utils/diff-parser"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SplitSelection } from "./overlays"

/*
 * The colours the unified view gives each kind of row, a comment's sign
 * and its own markers, under the app's one-row header. No parser answers,
 * so code's own foreground is plain text throughout.
 */

let mounted: Awaited<ReturnType<typeof mountUnified>> | null = null

async function screenWith(options: MountUnifiedOptions) {
  mounted = await mountUnified({ ...options, header: true })
  await mounted.frame()
  return screenOf(mounted)
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const NONE: ReturnType<typeof ints> = [0, 0, 0, 0]

describe("a line's background", () => {
  // TWO_FILES under the header row: each mapping line sits one screen row down.
  const CONTEXT = 1
  const DELETION = 2
  const ADDITION = 3
  const CURSOR = 4
  const SELECTED = 5
  const DIVIDER = 7
  const SPACING = 8
  // Both gutter edges, the first cell of code and one well past the end of every line.
  const CELLS = [0, 5, 6, 70]

  async function backgrounds(cursorLine: number, anchor: number | null, lines: number[], expandingDivider: string | null = null) {
    const selection: SplitSelection | null =
      anchor === null
        ? null
        : { mode: "visual-line", startRow: Math.min(anchor, cursorLine), endRow: Math.max(anchor, cursorLine), startCol: 0, endCol: 0 }
    const { spans } = await screenWith({ raw: TWO_FILES, cursor: { line: cursorLine }, selection, expandingDivider })
    return lines.map((line) => CELLS.map((x) => bgAt(spans, x, line + 1)))
  }

  const row = (gutter: string, code: string | null) => [ints(gutter), ints(gutter), code ? ints(code) : NONE, code ? ints(code) : NONE]

  test("context, deletion, addition and the cursor line", async () => {
    expect(await backgrounds(CURSOR, null, [CONTEXT, DELETION, ADDITION, CURSOR, DIVIDER, SPACING])).toEqual([
      row(theme.mantle, null),
      row(theme.base, DELETION_BG),
      row(theme.base, ADDITION_BG),
      row(theme.base, CURSOR_LINE_BG),
      row(theme.mantle, theme.mantle),
      row(theme.mantle, null),
    ])
  })

  test("a linewise selection, the cursor's own line keeping the cursor line's colour", async () => {
    expect(await backgrounds(SELECTED + 1, SELECTED, [CONTEXT, SELECTED, SELECTED + 1])).toEqual([
      row(theme.mantle, null),
      row(theme.surface1, theme.surface0),
      row(theme.surface1, CURSOR_LINE_BG),
    ])
  })

  test("the cursor on a spacing row", async () => {
    expect(await backgrounds(SPACING, null, [SPACING])).toEqual([row(theme.base, CURSOR_LINE_BG)])
  })

  test("the cursor on a divider", async () => {
    expect(await backgrounds(DIVIDER, null, [DIVIDER])).toEqual([row(theme.mantle, CURSOR_LINE_BG)])
  })

  describe("a divider while it expands", () => {
    const expanding = () => new DiffLineMapping(parseDiff(TWO_FILES), "all").getLine(DIVIDER)!.dividerKey!

    test("with the cursor elsewhere", async () => {
      expect(await backgrounds(CURSOR, null, [DIVIDER], expanding())).toEqual([row(theme.surface0, theme.surface0)])
    })

    test("with the cursor on it", async () => {
      expect(await backgrounds(DIVIDER, null, [DIVIDER], expanding())).toEqual([row(theme.surface0, CURSOR_LINE_BG)])
    })
  })
})

/*
 * The cursor line's tint as literal values, so a frame shows the step
 * line-colors.test.ts asks for rather than whatever the constants hold.
 * TWO_FILES's mapping lines 1, 2 and 3 are context, the removed return and
 * the added one, each one screen row down; code starts at column 6.
 */
describe("the cursor line's tint", () => {
  const CODE = 6
  const PAST_END = 70

  test("on a context line, a removal and an addition", async () => {
    const tints = []
    for (const line of [1, 2, 3]) {
      const { spans } = await screenWith({ raw: TWO_FILES, cursor: { line } })
      tints.push([bgAt(spans, CODE, line + 1), bgAt(spans, PAST_END, line + 1)])
      await mounted!.dispose()
      mounted = null
    }
    expect(tints).toEqual([
      [ints("#2a2b3d"), ints("#2a2b3d")],
      [ints("#502838"), ints("#502838")],
      [ints("#28503c"), ints("#28503c")],
    ])
  })

  // The added return's word marks sit on its ` (column 9), ${ (16) and }` (22).
  test("an addition's word marks keep their own colour over it", async () => {
    const { spans } = await screenWith({ raw: TWO_FILES, cursor: { line: 3 } })
    expect([CODE + 9, CODE + 16, CODE + 23].map((x) => bgAt(spans, x, 4))).toEqual(Array(3).fill(ints("#2b6b4a")))
    expect([CODE + 8, CODE + 10, CODE + 18].map((x) => bgAt(spans, x, 4))).toEqual(Array(3).fill(ints("#28503c")))
  })

  test("a search hit keeps its own colour over it", async () => {
    const search = {
      matches: [
        { line: 1, startCol: 0, endCol: 6 },
        { line: 3, startCol: 2, endCol: 8 },
      ],
      current: 0,
    }
    const { spans } = await screenWith({ raw: TWO_FILES, cursor: { line: 3 }, search })
    expect([CODE + 2, CODE + 7].map((x) => bgAt(spans, x, 4))).toEqual(Array(2).fill(ints(SYNTAX_PALETTE["search.match"]!.bg!)))
    expect(bgAt(spans, CODE + 8, 4)).toEqual(ints("#28503c"))
  })

  // Mapping lines 4 to 6: the closing brace, the added blank line and the line after it.
  test("in a linewise selection, the cursor's own line keeps its tint and its neighbours take the selection's", async () => {
    const selection: SplitSelection = { mode: "visual-line", startRow: 4, endRow: 6, startCol: 0, endCol: 0 }
    const { spans } = await screenWith({ raw: TWO_FILES, cursor: { line: 5 }, selection })
    expect([5, 6, 7].map((y) => bgAt(spans, CODE, y))).toEqual([ints("#313244"), ints("#28503c"), ints("#313244")])
  })
})

test("a comment's sign is coloured by its status: local, pending, synced, edited and resolved", async () => {
  const comment = (id: string, more: Partial<Comment>): Comment => ({
    id,
    filename: "src/greet.ts",
    line: 2,
    side: "RIGHT",
    body: "why?",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "local",
    ...more,
  })
  // Screen rows under the header: greet.ts's lines from 1, farewell.ts's from 11.
  const signed: [Comment, number, string][] = [
    [comment("local", { side: "LEFT" }), 3, theme.blue],
    [comment("pending", { status: "pending" }), 4, theme.yellow],
    [comment("synced", { line: 1, status: "synced" }), 2, theme.green],
    [comment("edited", { filename: "src/farewell.ts", line: 1, status: "synced", localEdit: "why not?" }), 11, theme.yellow],
    [comment("resolved", { filename: "src/farewell.ts", line: 2, status: "synced", isThreadResolved: true }), 12, colors.commentResolved],
  ]
  const screen = await screenWith({ raw: TWO_FILES, comments: signed.map(([c]) => c) })
  expect(signed.map(([c, y]) => [c.id, charAt(screen, [0, y]), fgAt(screen.spans, 0, y)])).toEqual(
    signed.map(([c, , colour]) => [c.id, "●", ints(colour)])
  )
})

/*
 * A marker is drawn in surface2 over the background its cell already had,
 * the one the cell to its left shows too.
 */
describe("a marker's colours", () => {
  const cellOf = (screen: Awaited<ReturnType<typeof screenWith>>, at: At) => [charAt(screen, at), fgAt(screen.spans, ...at), bgAt(screen.spans, ...at)]

  test("the › ending an addition line", async () => {
    const screen = await screenWith({ raw: ONE_LONG_LINE, width: 60, height: 10 })
    expect(cellOf(screen, [59, 4])).toEqual(["›", ints(theme.surface2), ints(ADDITION_BG)])
    expect(bgAt(screen.spans, 58, 4)).toEqual(ints(ADDITION_BG))
  })

  // Scrolled as revealing column 150 of the wide line scrolls it.
  test("the ‹ on a context line, a deletion and an addition", async () => {
    const screen = await screenWith({ raw: ONE_WIDE_LINE, height: 8, column: 85 })
    expect([2, 3, 4].map((y) => cellOf(screen, [5, y]))).toEqual([
      ["‹", ints(theme.surface2), ints(theme.mantle)],
      ["‹", ints(theme.surface2), ints(theme.base)],
      ["‹", ints(theme.surface2), ints(theme.base)],
    ])
    expect([2, 3, 4].map((y) => bgAt(screen.spans, 4, y))).toEqual([ints(theme.mantle), ints(theme.base), ints(theme.base)])
    expect([2, 3].map((y) => bgAt(screen.spans, 6, y))).toEqual([NONE, ints(DELETION_BG)])
  })

  // A continuation row's gutter is coloured as its line's first row is.
  const gutterOf = (screen: Awaited<ReturnType<typeof screenWith>>, y: number) =>
    [0, 1, 2, 3, 4, 5].map((x) => [fgAt(screen.spans, x, y), bgAt(screen.spans, x, y)])

  test("the ↳ and the gutter around it on a wrapped addition line", async () => {
    const screen = await screenWith({ raw: ONE_LONG_LINE, width: 60, height: 10, wrap: true })
    expect(cellOf(screen, [5, 5])).toEqual(["↳", ints(theme.surface2), ints(theme.base)])
    expect(gutterOf(screen, 4)).toEqual(Array(6).fill([ints(theme.overlay0), ints(theme.base)]))
    expect(gutterOf(screen, 5).slice(0, 5)).toEqual(Array(5).fill([ints(theme.overlay0), ints(theme.base)]))
    expect([4, 5].map((y) => bgAt(screen.spans, 6, y))).toEqual([ints(ADDITION_BG), ints(ADDITION_BG)])
  })

  // TWO_FILES at 30 wraps greet.ts's first line, a line of context on screen row 2.
  test("the ↳ and the gutter around it on a wrapped context line", async () => {
    const screen = await screenWith({ raw: TWO_FILES, width: 30, height: 40, wrap: true })
    expect(cellOf(screen, [5, 3])).toEqual(["↳", ints(theme.surface2), ints(theme.mantle)])
    expect(gutterOf(screen, 2)).toEqual(Array(6).fill([ints(theme.overlay0), ints(theme.mantle)]))
    expect(gutterOf(screen, 3).slice(0, 5)).toEqual(Array(5).fill([ints(theme.overlay0), ints(theme.mantle)]))
  })
})

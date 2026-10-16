import { test, expect, describe, afterEach } from "bun:test"
import { CURSOR_ADDITION_BG, CURSOR_LINE_BG } from "../diff-rows/line-colors"
import { FAR_HUNK, ONE_WIDE_LINE, TWO_FILES } from "../testing/diffs"
import { bgAt, fgAt, ints, mountSplit, type MountSplitOptions } from "../testing/split-frame"
import type { Comment, FileReviewStatus } from "../types"
import { revealColumn } from "../app/split-columns"
import { cellOfColumn } from "../diff-rows/cells"
import { SYNTAX_PALETTE } from "../diff-rows/syntax-palette"
import { theme } from "../theme"
import { createComment } from "../types"
import { parseDiff } from "../utils/diff-parser"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { contentOrigin, gutterWidth, paneWidths } from "./layout"

/*
 * What the split view draws at 120 columns: two 60-cell panes, old file
 * left and new right. Colours are not in a char frame, so the cursor is
 * checked through the frame's spans. No file contents are loaded, so
 * every hunk ends in a "rest of the file" divider.
 */

let mounted: Awaited<ReturnType<typeof mountSplit>> | null = null

async function mount(options: MountSplitOptions) {
  mounted = await mountSplit(options)
  return mounted
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const rows = (frame: string) => frame.split("\n")

const row = (frame: string, index: number) => frame.split("\n")[index]
const half = (text: string, side: "left" | "right") => (side === "left" ? text.slice(0, 60) : text.slice(60)).trimEnd()

describe("all files", () => {
  test("pairs a removal against the addition after it, and draws context in both halves", async () => {
    const frame = await (await mount({ raw: TWO_FILES })).frame()

    expect(half(row(frame, 2)!, "left")).toBe(`   2   return "Hello " + name`)
    expect(half(row(frame, 2)!, "right")).toBe("   2   return `Hello ${name}`")
    expect(half(row(frame, 4)!, "left")).toBe("")
    expect(frame).toBe(`\
 ▼   src/greet.ts +2 -1
   1 export function greet(name: string) {                     1 export function greet(name: string) {
   2   return "Hello " + name                                  2   return \`Hello \${name}\`
   3 }                                                         3 }
                                                               4
   4 export const version = 1                                  5 export const version = 1
     ▸ rest of the file  ↵

 ▼   src/farewell.ts +3 -0
                                                               1 export function farewell(name: string) {
                                                               2   return "Bye " + name
                                                               3 }
     ▸ rest of the file  ↵`)
  })
})

describe("folds", () => {
  test("a collapsed file is its header row alone, under a closed marker", async () => {
    const frame = await (await mount({
      raw: TWO_FILES,
      mappingOptions: { collapsedFiles: new Set(["src/farewell.ts"]) },
    })).frame()

    expect(frame).toBe(`\
 ▼   src/greet.ts +2 -1
   1 export function greet(name: string) {                     1 export function greet(name: string) {
   2   return "Hello " + name                                  2   return \`Hello \${name}\`
   3 }                                                         3 }
                                                               4
   4 export const version = 1                                  5 export const version = 1
     ▸ rest of the file  ↵

 ▶   src/farewell.ts +3 -0`)
  })
})

describe("collapsed context", () => {
  test("a far hunk's divider starts where the left pane's code does, over numbers as wide as unified's", async () => {
    const frame = await (await mount({ raw: FAR_HUNK })).frame()

    expect(frame).toBe(`\
 ▼   schema.graphql +1 -0
      ▸ 502 lines  ↵
  503   trackingId: Long @semanticNonNull                     503   trackingId: Long @semanticNonNull
                                                              504   showSkipAdsChannelList: Boolean @semanticNonNull
  504   "Catalogue price, before any discount."               505   "Catalogue price, before any discount."
  505   monthlyPrice: Money @semanticNonNull                  506   monthlyPrice: Money @semanticNonNull
      ▸ rest of the file  ↵`)
  })
})

describe("signs", () => {
  const comment = (id: string, side: Comment["side"]): Comment => ({
    id,
    filename: "src/greet.ts",
    line: 2,
    side,
    body: "why?",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "local",
  })
  const viewed = new Map<string, FileReviewStatus>([
    ["src/farewell.ts", { filename: "src/farewell.ts", viewed: true }],
  ])

  test("a comment's sign sits in the half of its side, and a viewed file's header is ticked", async () => {
    const frame = await (await mount({
      raw: TWO_FILES,
      comments: [comment("right", "RIGHT"), comment("left", "LEFT")],
      fileStatuses: viewed,
    })).frame()

    expect(row(frame, 2)).toBe(`●  2   return "Hello " + name                               ●  2   return \`Hello \${name}\``)
    expect(row(frame, 8)).toBe(" ▼ ✓ src/farewell.ts +3 -0")
    expect(frame).toBe(`\
 ▼   src/greet.ts +2 -1
   1 export function greet(name: string) {                     1 export function greet(name: string) {
●  2   return "Hello " + name                               ●  2   return \`Hello \${name}\`
   3 }                                                         3 }
                                                               4
   4 export const version = 1                                  5 export const version = 1
     ▸ rest of the file  ↵

 ▼ ✓ src/farewell.ts +3 -0
                                                               1 export function farewell(name: string) {
                                                               2   return "Bye " + name
                                                               3 }
     ▸ rest of the file  ↵`)
  })

  test("only the side a comment is on shows it", async () => {
    const frame = await (await mount({ raw: TWO_FILES, comments: [comment("left", "LEFT")] })).frame()

    expect(row(frame, 2)).toBe(`●  2   return "Hello " + name                                  2   return \`Hello \${name}\``)
  })

  test("a comment written from the left pane on a context line draws its sign in the left half", async () => {
    const files = parseDiff(TWO_FILES)
    const mapping = new DiffLineMapping(files, "all")
    const line = mapping.allLines.findIndex((l) => l.type === "context" && l.oldLineNum === 4)
    const anchor = mapping.getCommentAnchor(line, "left")!
    expect(anchor).toMatchObject({ side: "LEFT", line: 4 })
    const written = createComment(anchor.filename, anchor.line, "why?", anchor.side, "@you")
    const frame = await (await mount({ raw: TWO_FILES, comments: [written] })).frame()

    expect(half(row(frame, 5)!, "left")).toBe("●  4 export const version = 1")
    expect(half(row(frame, 5)!, "right")).toBe("   5 export const version = 1")
  })
})

describe("sidescroll", () => {
  test("the right pane scrolls on its own, marking what runs past either edge", async () => {
    const frame = await (await mount({ raw: ONE_WIDE_LINE, columns: { left: 0, right: 100 }, height: 8 })).frame()

    expect(half(row(frame, 2)!, "right")).toBe("   2 ‹.col110..col120..col130..col140..col150..col160..col1›")
    expect(frame).toBe(`\
 ▼   wide.ts +1 -1
   1 const short = 1                                           1 ‹
   2 const wide = 0                                            2 ‹.col110..col120..col130..col140..col150..col160..col1›
     ▸ rest of the file  ↵`)
  })

  test("scrolled to the line's end, only the left edge is marked", async () => {
    const frame = await (await mount({ raw: ONE_WIDE_LINE, columns: { left: 0, right: 150 }, height: 8 })).frame()

    expect(row(frame, 2)).toBe(`   2 const wide = 0                                            2 ‹ol170..col180..col190.."`)
  })
})

describe("sidescroll following the cursor", () => {
  // ONE_WIDE_LINE's added line, in the right pane, laid out as the view lays it out.
  const WIDE_ROW = 2
  const wideMapping = new DiffLineMapping(parseDiff(ONE_WIDE_LINE), "all")
  const wideLine = wideMapping.allLines.find((line) => line.type === "addition")!.content
  const panes = paneWidths(120)
  const origin = contentOrigin(gutterWidth(wideMapping))
  const CODE_X = panes.left + origin
  const CODE_CELLS = panes.right - origin
  const WIDE_CELLS = cellOfColumn(wideLine, wideLine.length)
  const revealed = (col: number) => ({ left: 0, right: revealColumn(0, col, CODE_CELLS, WIDE_CELLS) })

  test("a cursor past the right pane's window is drawn once the pane reveals it, and the left pane stays put", async () => {
    const columns = revealed(120)
    const view = await mount({ raw: ONE_WIDE_LINE, cursor: { row: WIDE_ROW, col: 120 }, columns, height: 8 })
    const frame = await view.frame()

    expect(half(row(frame, WIDE_ROW)!, "left")).toBe("   2 const wide = 0")
    expect(half(row(frame, WIDE_ROW)!, "right")).toStartWith("   2 ‹")
    expect(bgAt(view.setup.captureSpans(), CODE_X + 120 - columns.right, WIDE_ROW)).toEqual(ints(theme.rosewater))
  })

  test("the current search hit past the window shows once the cursor on it is revealed", async () => {
    const search = { matches: [{ line: 3, startCol: 150, endCol: 156 }], current: 0 }
    const before = await mount({ raw: ONE_WIDE_LINE, search, height: 8 })
    expect(row(await before.frame(), WIDE_ROW)).not.toContain("col170")
    await before.dispose()

    const columns = revealed(150)
    const view = await mount({ raw: ONE_WIDE_LINE, search, cursor: { row: WIDE_ROW, col: 150 }, columns, height: 8 })
    const frame = await view.frame()
    const x = CODE_X + 150 - columns.right
    expect(row(frame, WIDE_ROW)!.slice(x, x + 6)).toBe("col170")
    expect(bgAt(view.setup.captureSpans(), x + 1, WIDE_ROW)).toEqual(ints(SYNTAX_PALETTE["search.current"]!.bg!))
  })
})

describe("windowing", () => {
  test("only the rows from scrollTop, as many as fit, are drawn", async () => {
    const frame = await (await mount({ raw: TWO_FILES, scrollTop: 3, height: 4 })).frame()

    expect(frame).toBe(`\
   3 }                                                         3 }
                                                               4
   4 export const version = 1                                  5 export const version = 1
     ▸ rest of the file  ↵`)
  })
})

describe("cursor", () => {
  const RETURN_ROW = 2
  const CURSOR_X = 60 + "   2 ".length + 2
  test("the active half's cell is a block while focused, and the characters stay the same", async () => {
    const view = await mount({ raw: TWO_FILES, cursor: { row: RETURN_ROW, col: 2 }, side: "right" })
    const focused = await view.frame()
    expect(bgAt(view.setup.captureSpans(), CURSOR_X, RETURN_ROW)).toEqual(ints(theme.rosewater))
    expect(bgAt(view.setup.captureSpans(), CURSOR_X + 1, RETURN_ROW)).toEqual(ints(CURSOR_ADDITION_BG))

    view.setFocused(false)
    expect(await view.frame()).toBe(focused)
    expect(bgAt(view.setup.captureSpans(), CURSOR_X, RETURN_ROW)).toEqual(ints(CURSOR_ADDITION_BG))
  })

  const HEADER_ROW = 0
  const PATH_X = " ▼   ".length

  test("a file header keeps its own background under the cursor, as unified's does, while a divider takes the cursor line's", async () => {
    const DIVIDER_ROW = 6
    const onHeader = await mount({ raw: TWO_FILES, cursor: { row: HEADER_ROW, col: 0 } })
    await onHeader.frame()
    expect(bgAt(onHeader.setup.captureSpans(), 30, HEADER_ROW)).toEqual(ints(theme.surface0))
    await onHeader.dispose()

    const onDivider = await mount({ raw: TWO_FILES, cursor: { row: DIVIDER_ROW, col: 0 } })
    await onDivider.frame()
    expect(bgAt(onDivider.setup.captureSpans(), 30, DIVIDER_ROW)).toEqual(ints(CURSOR_LINE_BG))
  })

  test("a file header under the cursor draws the block on its path, as unified's terminal cursor sits", async () => {
    const view = await mount({ raw: TWO_FILES, cursor: { row: HEADER_ROW, col: 0 } })
    const frame = await view.frame()
    const spans = view.setup.captureSpans()
    expect(row(frame, HEADER_ROW)).toBe(" ▼   src/greet.ts +2 -1")
    expect([fgAt(spans, PATH_X, HEADER_ROW), bgAt(spans, PATH_X, HEADER_ROW)]).toEqual([ints(theme.base), ints(theme.rosewater)])
    expect(bgAt(spans, PATH_X + 1, HEADER_ROW)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 1, HEADER_ROW)).toEqual(ints(theme.surface0))
  })

  test("on a collapsed file's header a column past the path keeps the block on its last character, the stats where they were", async () => {
    const COLLAPSED_ROW = 8
    const view = await mount({
      raw: TWO_FILES,
      mappingOptions: { collapsedFiles: new Set(["src/farewell.ts"]) },
      cursor: { row: COLLAPSED_ROW, col: 40 },
    })
    const frame = await view.frame()
    const spans = view.setup.captureSpans()
    const last = PATH_X + "src/farewell.ts".length - 1
    expect(row(frame, COLLAPSED_ROW)).toBe(" ▶   src/farewell.ts +3 -0")
    expect(bgAt(spans, last, COLLAPSED_ROW)).toEqual(ints(theme.rosewater))
    expect(bgAt(spans, last - 1, COLLAPSED_ROW)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, last + 2, COLLAPSED_ROW)).toEqual(ints(theme.surface0))
  })

  test("an unfocused view draws no block on the header under its cursor", async () => {
    const view = await mount({ raw: TWO_FILES, cursor: { row: HEADER_ROW, col: 0 }, focused: false })
    await view.frame()
    const spans = view.setup.captureSpans()
    for (let x = 0; x < 120; x++) expect(bgAt(spans, x, HEADER_ROW)).not.toEqual(ints(theme.rosewater))
  })
})

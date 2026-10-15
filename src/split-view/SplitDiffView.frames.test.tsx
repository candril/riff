import { test, expect, describe, afterEach } from "bun:test"
import { RGBA } from "@opentui/core"
import { createSignal } from "solid-js"
import { LineSpans } from "../diff-rows/line-spans"
import { RowLineSource } from "../diff-rows/row-source"
import { CURSOR_ADDITION_BG } from "../diff-rows/line-colors"
import { FAR_HUNK, ONE_WIDE_LINE, TWO_FILES } from "../testing/diffs"
import { mountJsx } from "../testing/frame"
import type { Comment, FileReviewStatus } from "../types"
import { parseDiff } from "../utils/diff-parser"
import { FileParses } from "../vim-diff/file-parses"
import { theme } from "../theme"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { DiffLineMappingOptions } from "../vim-diff/types"
import { SplitDiffView, type SplitDiffViewProps } from "./SplitDiffView"

/*
 * What the split view draws at 120 columns: two 60-cell panes, old file
 * left and new right. Colours are not in a char frame, so the cursor is
 * checked through the frame's spans. As in VimDiffView.frames.test.ts no
 * file contents are loaded, so every hunk ends in a "rest of the file"
 * divider.
 */

interface MountOptions extends Partial<Omit<SplitDiffViewProps, "mapping" | "source" | "files" | "lineSpans">> {
  raw: string
  mappingOptions?: DiffLineMappingOptions
}

let mounted: Awaited<ReturnType<typeof mountJsx>> | null = null

async function mount(options: MountOptions) {
  const { raw, mappingOptions, ...rest } = options
  const files = parseDiff(raw)
  const mapping = new DiffLineMapping(files, "all", undefined, mappingOptions)
  const props: SplitDiffViewProps = {
    mapping,
    source: new RowLineSource(mapping, "split"),
    files,
    // No parser answers, so nothing waits on a worker and every line is plain text.
    lineSpans: new LineSpans(new FileParses(async () => null), async () => null),
    highlightVersion: 0,
    comments: [],
    fileStatuses: new Map(),
    expandingDivider: null,
    cursor: { row: -1, col: 0 },
    side: "right",
    scrollTop: 0,
    columns: { left: 0, right: 0 },
    width: 120,
    height: 20,
    focused: true,
    ...rest,
  }
  const [focused, setFocused] = createSignal(props.focused)
  const live = { ...props, get focused() { return focused() } }
  mounted = await mountJsx(() => <SplitDiffView {...live} />, { width: props.width, height: props.height })
  return { ...mounted, setFocused }
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
  const bgAt = (spans: ReturnType<NonNullable<typeof mounted>["setup"]["captureSpans"]>, x: number, y: number) => {
    let at = 0
    for (const span of spans.lines[y]!.spans) {
      if (x < at + span.width) return span.bg.toInts()
      at += span.width
    }
    return undefined
  }
  const ints = (hex: string) => RGBA.fromHex(hex).toInts()

  test("the active half's cell is a block while focused, and the characters stay the same", async () => {
    const view = await mount({ raw: TWO_FILES, cursor: { row: RETURN_ROW, col: 2 }, side: "right" })
    const focused = await view.frame()
    expect(bgAt(view.setup.captureSpans(), CURSOR_X, RETURN_ROW)).toEqual(ints(theme.rosewater))
    expect(bgAt(view.setup.captureSpans(), CURSOR_X + 1, RETURN_ROW)).toEqual(ints(CURSOR_ADDITION_BG))

    view.setFocused(false)
    expect(await view.frame()).toBe(focused)
    expect(bgAt(view.setup.captureSpans(), CURSOR_X, RETURN_ROW)).toEqual(ints(CURSOR_ADDITION_BG))
  })
})

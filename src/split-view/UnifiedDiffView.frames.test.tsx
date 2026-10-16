import { test, expect, describe, afterEach } from "bun:test"
import { ADDITION_BG } from "../diff-rows/line-colors"
import { fade } from "../diff-rows/segments"
import { SYNTAX_PALETTE } from "../diff-rows/syntax-palette"
import { FAR_HUNK, ONE_LONG_LINE, ONE_WIDE_LINE, TWO_FILES } from "../testing/diffs"
import { bgAt, fgAt, ints } from "../testing/split-frame"
import { mountUnified, type MountUnifiedOptions } from "../testing/unified-frame"
import { theme } from "../theme"
import type { Comment, FileReviewStatus } from "../types"

/*
 * What the unified view draws on its own, with no header row above it. As
 * in VimDiffView.frames.test.ts no file contents are loaded, so every hunk
 * ends in a "rest of the file" divider.
 */

let mounted: Awaited<ReturnType<typeof mountUnified>> | null = null

async function frameOf(options: MountUnifiedOptions) {
  mounted = await mountUnified(options)
  return mounted.frame()
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const comment = (filename: string, line: number, side: Comment["side"]): Comment => ({
  id: `${filename}:${line}:${side}`,
  filename,
  line,
  side,
  body: "why?",
  createdAt: "2026-01-01T00:00:00.000Z",
  status: "local",
})

describe("files", () => {
  test("all files: each file's header, its numbered lines and a divider after each hunk", async () => {
    expect(await frameOf({ raw: TWO_FILES })).toBe(`\
 ▼   src/greet.ts +2 -1
   1 export function greet(name: string) {
   2   return "Hello " + name
   2   return \`Hello \${name}\`
   3 }
   4
   5 export const version = 1
     ▸ rest of the file  ↵

 ▼   src/farewell.ts +3 -0
   1 export function farewell(name: string) {
   2   return "Bye " + name
   3 }
     ▸ rest of the file  ↵`)
  })

  test("a single file, under no header of its own", async () => {
    expect(await frameOf({ raw: TWO_FILES, mode: "single", selectedFileIndex: 0 })).toBe(`\
   1 export function greet(name: string) {
   2   return "Hello " + name
   2   return \`Hello \${name}\`
   3 }
   4
   5 export const version = 1
     ▸ rest of the file  ↵`)
  })

  test("a collapsed file is its header row alone", async () => {
    const frame = await frameOf({ raw: TWO_FILES, mappingOptions: { collapsedFiles: new Set(["src/farewell.ts"]) } })
    expect(frame.split("\n").slice(-2)).toEqual(["", " ▶   src/farewell.ts +3 -0"])
  })

  test("a hunk far down the file widens the gutter and opens on a divider", async () => {
    expect(await frameOf({ raw: FAR_HUNK })).toBe(`\
 ▼   schema.graphql +1 -0
      ▸ 502 lines  ↵
  503   trackingId: Long @semanticNonNull
  504   showSkipAdsChannelList: Boolean @semanticNonNull
  505   "Catalogue price, before any discount."
  506   monthlyPrice: Money @semanticNonNull
      ▸ rest of the file  ↵`)
  })
})

describe("signs", () => {
  test("a comment marks its row on either side, and a viewed file's header is ticked", async () => {
    const frame = await frameOf({
      raw: TWO_FILES,
      comments: [comment("src/greet.ts", 2, "RIGHT"), comment("src/greet.ts", 2, "LEFT")],
      fileStatuses: new Map<string, FileReviewStatus>([
        ["src/farewell.ts", { filename: "src/farewell.ts", viewed: true }],
      ]),
    })
    const rows = frame.split("\n")
    expect(rows[2]).toBe(`●  2   return "Hello " + name`)
    expect(rows[3]).toBe("●  2   return `Hello ${name}`")
    expect(rows[9]).toBe(" ▼ ✓ src/farewell.ts +3 -0")
  })
})

describe("wrap", () => {
  const WRAPPED = { raw: ONE_LONG_LINE, width: 60, height: 9 }

  test("on, a long line carries on in a row whose gutter is blank, sign and all, but for ↳", async () => {
    expect(await frameOf({ ...WRAPPED, wrap: true, comments: [comment("notes.ts", 2, "RIGHT")] })).toBe(`\
 ▼   notes.ts +1 -1
   1 export function note() {
   2   return 1
●  2   const message = "a fairly long line that keeps going
    ↳a fairly long line that keeps going "
   3 }
     ▸ rest of the file  ↵`)
  })

  test("off, the same line is cut at the pane's edge, its last cell a ›", async () => {
    expect(await frameOf({ ...WRAPPED, wrap: false })).toBe(`\
 ▼   notes.ts +1 -1
   1 export function note() {
   2   return 1
   2   const message = "a fairly long line that keeps going›
   3 }
     ▸ rest of the file  ↵`)
  })

  test("scrolled into a wrapped line, the top row is its continuation", async () => {
    expect(await frameOf({ ...WRAPPED, height: 3, wrap: true, scrollTop: 4 })).toBe(`\
    ↳a fairly long line that keeps going "
   3 }
     ▸ rest of the file  ↵`)
  })
})

describe("sidescroll", () => {
  test("a column scrolls every line's code, the gutter and the chrome staying put, each line with text marked ‹", async () => {
    expect(await frameOf({ raw: ONE_WIDE_LINE, height: 6, column: 150 })).toBe(`\
 ▼   wide.ts +1 -1
   1‹
   2‹
   2‹col170..col180..col190.."
     ▸ rest of the file  ↵`)
  })

  test("scrolled into the middle of a wide line, it is marked at both edges", async () => {
    expect(await frameOf({ raw: ONE_WIDE_LINE, height: 6, column: 80 })).toBe(`\
 ▼   wide.ts +1 -1
   1‹
   2‹
   2‹l080..col090..col100..col110..col120..col130..col140..col150..col160..col1›
     ▸ rest of the file  ↵`)
  })
})

/*
 * The overlays on rows of their own, no header row above: TWO_FILES' line n
 * is screen row n, its code from column 5.
 */
describe("overlays", () => {
  const CODE = 5
  const spans = () => mounted!.setup.captureSpans()

  test("search: each hit in the match colour, the current one in its own, on a sliced line its part of the hit", async () => {
    const frame = await frameOf({
      raw: ONE_LONG_LINE,
      width: 60,
      height: 9,
      wrap: true,
      search: {
        matches: [
          { line: 1, startCol: 7, endCol: 15 },
          // "keeps going a fairly", across the break after "going".
          { line: 3, startCol: 43, endCol: 63 },
        ],
        current: 1,
      },
    })
    expect(frame.split("\n")[4]).toBe("    ↳a fairly long line that keeps going \"")
    const match = ints(SYNTAX_PALETTE["search.match"]!.bg!)
    const current = ints(SYNTAX_PALETTE["search.current"]!.bg!)
    const plain = bgAt(spans(), CODE, 1)
    expect([CODE + 6, CODE + 7, CODE + 14, CODE + 15].map((x) => bgAt(spans(), x, 1))).toEqual([plain, match, match, plain])
    expect(fgAt(spans(), CODE + 7, 1)).toEqual(ints(theme.base))
    expect([CODE + 42, CODE + 43, CODE + 53].map((x) => bgAt(spans(), x, 3))).toEqual([
      bgAt(spans(), CODE, 3),
      current,
      current,
    ])
    expect([CODE, CODE + 7, CODE + 8].map((x) => bgAt(spans(), x, 4))).toEqual([current, current, bgAt(spans(), CODE + 30, 4)])
  })

  test("a charwise selection skips riff's own rows between its ends", async () => {
    await frameOf({ raw: TWO_FILES, selection: { mode: "visual", startRow: 6, startCol: 7, endRow: 10, endCol: 8 } })
    const selected = ints(theme.surface1)
    expect([CODE + 6, CODE + 7, CODE + 23].map((x) => bgAt(spans(), x, 6))).toEqual([
      bgAt(spans(), CODE, 6),
      selected,
      selected,
    ])
    for (const y of [7, 8, 9]) expect(bgAt(spans(), CODE + 7, y)).not.toEqual(selected)
    expect([CODE, CODE + 8, CODE + 9].map((x) => bgAt(spans(), x, 10))).toEqual([selected, selected, bgAt(spans(), CODE + 30, 10)])
  })

  test("flash: the code faded but for its matches, a label on a match's first character, the gutter lit", async () => {
    const frame = await frameOf({
      raw: TWO_FILES,
      flash: [
        { line: 1, startCol: 7, endCol: 15, label: "a" },
        { line: 9, startCol: 4, endCol: 12, label: "s" },
      ],
    })
    const rows = frame.split("\n")
    expect(rows[1]).toBe("   1 export aunction greet(name: string) {")
    expect(rows[9]).toBe(" ▼   src/sarewell.ts +3 -0")
    const label = [ints(theme.base), ints(theme.red)]
    expect([fgAt(spans(), CODE + 7, 1), bgAt(spans(), CODE + 7, 1)]).toEqual(label)
    expect([fgAt(spans(), CODE + 8, 1), bgAt(spans(), CODE + 8, 1)]).toEqual([ints(theme.text), ints(theme.surface1)])
    expect(fgAt(spans(), CODE, 1)).toEqual(ints(fade(theme.text, theme.base)))
    expect(fgAt(spans(), 3, 1)).toEqual(ints(theme.overlay0))
    expect(fgAt(spans(), CODE + 4, 9)).toEqual(label[0])
  })

  test("flash: the › at the edge takes the faded glyph over the code's own background", async () => {
    await frameOf({ raw: ONE_LONG_LINE, width: 60, height: 9, flash: [] })
    expect(fgAt(spans(), 59, 3)).toEqual(ints(fade(theme.surface2, ADDITION_BG)))
  })

  test("the › at the edge keeps a search hit's background under it", async () => {
    const frame = await frameOf({
      raw: ONE_LONG_LINE,
      width: 60,
      height: 9,
      search: { matches: [{ line: 3, startCol: 50, endCol: 60 }], current: 0 },
    })
    expect(frame.split("\n")[3]!.at(-1)).toBe("›")
    expect([fgAt(spans(), 59, 3), bgAt(spans(), 59, 3)]).toEqual([
      ints(theme.surface2),
      ints(SYNTAX_PALETTE["search.current"]!.bg!),
    ])
  })
})

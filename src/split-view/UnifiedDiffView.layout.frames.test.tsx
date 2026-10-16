import { test, expect, describe, afterEach } from "bun:test"
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
import { splitAtBar } from "../testing/screen"
import { mountUnified, type MountUnifiedOptions } from "../testing/unified-frame"
import { parseDiff } from "../utils/diff-parser"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { unifiedContentWidth } from "./content-width"
import { unifiedOrigins } from "./layout"

/*
 * Where the unified view puts each row and cell, under the app's one-row
 * header: sections and their gutters, wrap breaks, and how narrow panes cut
 * code and file headers. Tabs are left out.
 */

let mounted: Awaited<ReturnType<typeof mountUnified>> | null = null

async function frameOf(options: MountUnifiedOptions) {
  mounted = await mountUnified({ ...options, header: true })
  return mounted.frame()
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

describe("sections", () => {
  test("the other single file", async () => {
    expect(await frameOf({ raw: TWO_FILES, mode: "single", selectedFileIndex: 1 })).toBe(`
   1 export function farewell(name: string) {
   2   return "Bye " + name
   3 }
     ▸ rest of the file  ↵`)
  })

  test("each file sizes its own gutter by its numbers", async () => {
    expect(await frameOf({ raw: MIXED_DIGITS })).toBe(`
 ▼   short.ts +1 -1
   1 const a = 1
   2 const b = 2
   2 const b = 3
     ▸ rest of the file  ↵

 ▼   far.ts +1 -1
      ▸ 119 lines  ↵
  120 const c = 1
  121 const d = 2
  121 const d = 3
      ▸ rest of the file  ↵`)
  })
})

// The narrow widths put a break on the last cell of a row, where one cell of wrap width decides it.
describe("wrapped, continuation markers and all", () => {
  test("a long line, narrow", async () => {
    expect(await frameOf({ raw: ONE_LONG_LINE, width: 25, height: 20, mode: "single", selectedFileIndex: 0, wrap: true })).toBe(`
   1 export function
    ↳note() {
   2   return 1
   2   const message =
    ↳"a fairly long line
    ↳that keeps going a
    ↳fairly long line
    ↳that keeps going "
   3 }
     ▸ rest of the file`)
  })

  test("a long line, mid width", async () => {
    expect(await frameOf({ raw: ONE_LONG_LINE, width: 40, height: 20, mode: "single", selectedFileIndex: 0, wrap: true })).toBe(`
   1 export function note() {
   2   return 1
   2   const message = "a fairly long
    ↳line that keeps going a fairly
    ↳long line that keeps going "
   3 }
     ▸ rest of the file  ↵`)
  })

  test("two files, a break on the last cell", async () => {
    expect(await frameOf({ raw: TWO_FILES, width: 30, height: 40, wrap: true })).toBe(`
 ▼   src/greet.ts +2 -1
   1 export function greet(
    ↳name: string) {
   2   return "Hello " + name
   2   return \`Hello \${name}\`
   3 }
   4
   5 export const version = 1
     ▸ rest of the file  ↵

 ▼   src/farewell.ts +3 -0
   1 export function
    ↳farewell(name: string) {
   2   return "Bye " + name
   3 }
     ▸ rest of the file  ↵`)
  })

  test("a hunk far down the file, a break on the last cell", async () => {
    expect(await frameOf({ raw: FAR_HUNK, width: 30, height: 30, wrap: true })).toBe(`
 ▼   schema.graphql +1 -0
      ▸ 502 lines  ↵
  503   trackingId: Long
     ↳@semanticNonNull
  504
     ↳showSkipAdsChannelList:
     ↳Boolean
     ↳@semanticNonNull
  505   "Catalogue price,
     ↳before any discount."
  506   monthlyPrice: Money
     ↳@semanticNonNull
      ▸ rest of the file  ↵`)
  })

  // Ninety-nine rows beside a 5-cell gutter fit at 30; at 29 each line wraps, past 99 rows, and the gutter takes a digit.
  test("one cell short of 100 rows, the gutter widens only when it must", async () => {
    expect(await frameOf({ raw: JUST_FITS_AT_30, width: 30, height: 8, wrap: true })).toBe(`
 ▼   tight.ts +98 -0         ▀
   1 xxxxxxxxxxxxxxxxxxxxxxxx
   2 xxxxxxxxxxxxxxxxxxxxxxxx
   3 xxxxxxxxxxxxxxxxxxxxxxxx
   4 xxxxxxxxxxxxxxxxxxxxxxxx
   5 xxxxxxxxxxxxxxxxxxxxxxxx
   6 xxxxxxxxxxxxxxxxxxxxxxxx`)
    await mounted!.dispose()
    expect(await frameOf({ raw: JUST_FITS_AT_30, width: 29, height: 8, wrap: true })).toBe(`
 ▼   tight.ts +98 -0        ▀
    1 xxxxxxxxxxxxxxxxxxxxxx
     ↳xx
    2 xxxxxxxxxxxxxxxxxxxxxx
     ↳xx
    3 xxxxxxxxxxxxxxxxxxxxxx
     ↳xx`)
  })

  // Sixty lines, but over a hundred rows once wrapped: the gutter is sized by the rows.
  test("past 99 rows, the gutter takes another digit", async () => {
    const { body, bar } = splitAtBar(await frameOf({ raw: MANY_WRAPPED_LINES, width: 120, height: 40, wrap: true }), 120)
    expect(body.slice(0, 4)).toEqual([
      "",
      " ▼   wrapped.ts +60 -0",
      `    1 const line1 = "a line long enough that a 120-column pane wraps it onto a second row a line long enough that a`,
      `     ↳120-column pane wraps it onto a second row"`,
    ])
    expect(bar).toBe(" ████████████                           ")
  })

  test("past 99 rows in one section only, only that section's gutter widens", async () => {
    const { body, bar } = splitAtBar(await frameOf({ raw: SHORT_THEN_MANY_WRAPPED, width: 120, height: 40, wrap: true }), 120)
    expect(body.slice(0, 11)).toEqual([
      "",
      " ▼   short.ts +1 -1",
      "   1 const first = 1",
      "   2 const second = 2",
      "   2 const second = 3",
      "   3 const third = 4",
      "     ▸ rest of the file  ↵",
      "",
      " ▼   wrapped.ts +60 -0",
      `    1 const line1 = "a line long enough that a 120-column pane wraps it onto a second row a line long enough that a`,
      `     ↳120-column pane wraps it onto a second row"`,
    ])
    expect(bar).toBe(" ███████████▀                           ")
  })
})

describe("narrow, unwrapped", () => {
  test("a line past the edge ends in ›, a file header in its own last cell", async () => {
    expect(await frameOf({ raw: TWO_FILES, width: 30, height: 20 })).toBe(`
 ▼   src/greet.ts +2 -1
   1 export function greet(na›
   2   return "Hello " + name
   2   return \`Hello \${name}\`
   3 }
   4
   5 export const version = 1
     ▸ rest of the file  ↵

 ▼   src/farewell.ts +3 -0
   1 export function farewell›
   2   return "Bye " + name
   3 }
     ▸ rest of the file  ↵`)
  })

  // A file header keeps its gaps and is cut at the pane's edge, as FullRow lays out every full-width row.
  const headers: [number, string, string][] = [
    [16, " ▼   src/greet.t", " ▼   src/farewel"],
    [20, " ▼   src/greet.ts +2", " ▼   src/farewell.ts"],
    [22, " ▼   src/greet.ts +2 -", " ▼   src/farewell.ts +"],
    [24, " ▼   src/greet.ts +2 -1", " ▼   src/farewell.ts +3"],
  ]

  for (const [width, greet, farewell] of headers) {
    test(`at ${width} columns each file header is cut at the edge, its gaps kept`, async () => {
      const rows = (await frameOf({ raw: TWO_FILES, width, height: 18 })).split("\n")
      expect([rows[1], rows[10]]).toEqual([greet, farewell])
    })
  }

  // The scrollbar keeps its column, so code ends in › a cell short of it and a header is cut there.
  test("MIXED_DIGITS at 12 columns, its headers wider than its code", async () => {
    await frameOf({ raw: MIXED_DIGITS, width: 12, height: 5 })
    expect(mounted!.setup.captureCharFrame().split("\n").slice(0, 5)).toEqual([
      "            ",
      " ▼   short.█",
      "   1 const› ",
      "   2 const› ",
      "   2 const› ",
    ])
  })

  // The widest line of code beside its own section's gutter and a cell of padding; file headers are left out.
  test("unwrapped content is as wide as its widest line of code", () => {
    const corpus = { FAR_HUNK, JUST_FITS_AT_30, MANY_WRAPPED_LINES, MIXED_DIGITS, ONE_LONG_LINE, ONE_WIDE_LINE, SHORT_THEN_MANY_WRAPPED, TWO_FILES }
    const widths = Object.entries(corpus).flatMap(([name, raw]) =>
      (["all", "single"] as const).map((mode) => {
        const mapping = new DiffLineMapping(parseDiff(raw), mode, mode === "single" ? 0 : undefined)
        return `${name} ${mode} ${unifiedContentWidth(mapping.allLines, unifiedOrigins(mapping))}`
      })
    )
    expect(widths).toEqual([
      "FAR_HUNK all 57",
      "FAR_HUNK single 57",
      "JUST_FITS_AT_30 all 30",
      "JUST_FITS_AT_30 single 30",
      "MANY_WRAPPED_LINES all 160",
      "MANY_WRAPPED_LINES single 160",
      "MIXED_DIGITS all 18",
      "MIXED_DIGITS single 17",
      "ONE_LONG_LINE all 98",
      "ONE_LONG_LINE single 98",
      "ONE_WIDE_LINE all 181",
      "ONE_WIDE_LINE single 181",
      "SHORT_THEN_MANY_WRAPPED all 160",
      "SHORT_THEN_MANY_WRAPPED single 22",
      "TWO_FILES all 46",
      "TWO_FILES single 43",
    ])
  })
})

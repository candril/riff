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
import { bgAt, fgAt, ints } from "../testing/split-frame"
import { mountUnified, type MountUnifiedOptions } from "../testing/unified-frame"
import { theme } from "../theme"

/*
 * The unified view's scrollbar, under the app's one-row header. Its thumb
 * is the window's share of the track on every diff, up to the half of the
 * track OpenTUI caps it at (scroll-bar.ts), and the pinned file header
 * stops short of the bar's column, so a thumb on the top row stays in sight.
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

describe("the thumb moves down the track as the view scrolls", () => {
  test("two files at 80x8: at the top, mid-way and at the last scroll position", async () => {
    expect(await frameOf({ raw: TWO_FILES, height: 8, scrollTop: 0 })).toBe(`
 ▼   src/greet.ts +2 -1                                                        █
    1 export function greet(name: string) {                                    █
    2   return "Hello " + name                                                 █
    2   return \`Hello \${name}\`                                                 ▀
    3 }
    4
    5 export const version = 1`)
    mounted!.set("scrollTop", 4)
    expect(await mounted!.frame()).toBe(`
 ▼   src/greet.ts +2 -1
    4
    5 export const version = 1                                                 █
      ▸ rest of the file  ↵                                                    █
                                                                               █
 ▼   src/farewell.ts +3 -0                                                     ▀
    1 export function farewell(name: string) {`)
    mounted!.set("scrollTop", 8)
    expect(await mounted!.frame()).toBe(`
 ▼   src/greet.ts +2 -1
 ▼   src/farewell.ts +3 -0
    1 export function farewell(name: string) {
    2   return "Bye " + name                                                   ▄
    3 }                                                                        █
      ▸ rest of the file  ↵                                                    █
                                                                               █`)
  })

  test("two files at 80x6: at the top, mid-way and at the last scroll position", async () => {
    expect(await frameOf({ raw: TWO_FILES, height: 6, scrollTop: 0 })).toBe(`
 ▼   src/greet.ts +2 -1                                                        █
    1 export function greet(name: string) {                                    ▀
    2   return "Hello " + name
    2   return \`Hello \${name}\`
    3 }`)
    mounted!.set("scrollTop", 4)
    expect(await mounted!.frame()).toBe(`
 ▼   src/greet.ts +2 -1
    4                                                                          ▄
    5 export const version = 1                                                 █
      ▸ rest of the file  ↵`)
    mounted!.set("scrollTop", 10)
    expect(await mounted!.frame()).toBe(`
 ▼   src/farewell.ts +3 -0
    2   return "Bye " + name
    3 }
      ▸ rest of the file  ↵                                                    ▄
                                                                               █`)
  })

  test("wrapped two files at 21x9, scrolled into greet.ts's first line", async () => {
    expect(await frameOf({ raw: TWO_FILES, width: 21, height: 9, wrap: true, scrollTop: 3 })).toBe(`
 ▼   src/greet.ts +2
     ↳string) {     █
    2   return      █
     ↳"Hello " +
     ↳name
    2   return
     ↳\`Hello \${name}
     ↳\``)
  })
})

describe("beside the code", () => {
  // The code wraps a cell short of the bar.
  test("wrapped under the scrollbar", async () => {
    expect(await frameOf({ raw: FAR_HUNK, width: 31, height: 8, wrap: true })).toBe(`
 ▼   schema.graphql +1 -0     █
       ▸ 502 lines  ↵         █
   503   trackingId: Long     █
      ↳@semanticNonNull       ▀
   504
      ↳showSkipAdsChannelList:
      ↳Boolean`)
  })

  test("an unwrapped line past the edge ends in a › beside the scrollbar", async () => {
    expect(await frameOf({ raw: ONE_LONG_LINE, width: 60, height: 5 })).toBe(`
 ▼   notes.ts +1 -1                                        █
    1 export function note() {                             █
    2   return 1
    2   const message = "a fairly long line that keeps goi›`)
  })

  test("the pinned header leaves the thumb on its row in sight", async () => {
    expect(await frameOf({ raw: JUST_FITS_AT_30, width: 47, height: 5, scrollTop: 3 })).toBe(`
 ▼   tight.ts +98 -0                          ▀
    4 xxxxxxxxxxxxxxxxxxxxxxx
    5 xxxxxxxxxxxxxxxxxxxxxxx
    6 xxxxxxxxxxxxxxxxxxxxxxx`)
  })

  test("the pinned header over a file with a narrower gutter than the next", async () => {
    expect(await frameOf({ raw: MIXED_DIGITS, width: 40, height: 6, scrollTop: 1 })).toBe(`
 ▼   short.ts +1 -1                    ▄
    2 const b = 2                      █
    2 const b = 3                      ▀
      ▸ rest of the file  ↵`)
  })

  /*
   * Unwrapped code nearly twice the pane wide leaves no room for the bar:
   * the code keeps the last column and its › sits there. The bar's cells
   * are listed under the header row.
   */
  const pushedOff: [string, MountUnifiedOptions, string][] = [
    ["a long line at 40 columns", { raw: ONE_LONG_LINE, width: 40, height: 5 }, "   ›"],
    ["a long line at 50 columns", { raw: ONE_LONG_LINE, width: 50, height: 5 }, "   ›"],
    ["a long line at 51 columns", { raw: ONE_LONG_LINE, width: 51, height: 5 }, "██  "],
    ["a wide line at 30 columns", { raw: ONE_WIDE_LINE, width: 30, height: 5 }, "   ›"],
    ["a wide line at 91 columns", { raw: ONE_WIDE_LINE, width: 91, height: 5 }, "   ›"],
    ["a wide line at 92 columns", { raw: ONE_WIDE_LINE, width: 92, height: 5 }, "██  "],
    ["many long lines at 40x12", { raw: MANY_WRAPPED_LINES, width: 40, height: 12 }, " ››››››››››"],
    ["many long lines at 81x20", { raw: MANY_WRAPPED_LINES, width: 81, height: 20 }, " ››››››››››››››››››"],
    ["many long lines at 82x20", { raw: MANY_WRAPPED_LINES, width: 82, height: 20 }, "█████▀             "],
    ["a short file, then many long lines, at 40x12", { raw: SHORT_THEN_MANY_WRAPPED, width: 40, height: 12 }, "        ›››"],
  ]

  for (const [name, options, lastColumn] of pushedOff) {
    test(`unwrapped, the last column: ${name}`, async () => {
      const frame = await frameOf(options)
      expect(frame.split("\n").slice(1).map((row) => row[options.width! - 1] ?? " ").join("")).toBe(lastColumn)
    })
  }
})

test("the thumb is drawn in surface2 over a track of surface0", async () => {
  await frameOf({ raw: TWO_FILES, width: 80, height: 8 })
  const spans = mounted!.setup.captureSpans()
  // Rows 1 to 4 are thumb, 5 to 7 bare track.
  expect([1, 4].map((y) => fgAt(spans, 79, y))).toEqual([ints(theme.surface2), ints(theme.surface2)])
  expect([1, 5, 7].map((y) => bgAt(spans, 79, y))).toEqual([ints(theme.surface0), ints(theme.surface0), ints(theme.surface0)])
})

import { test, expect, describe, afterEach } from "bun:test"
import { FAR_HUNK, ONE_LONG_LINE, ONE_WIDE_LINE, TWO_FILES } from "../testing/diffs"
import { mountUnified, type MountUnifiedOptions } from "../testing/unified-frame"
import type { Comment, FileReviewStatus } from "../types"

/*
 * What the unified view draws on its own, with no header row above it. As
 * in VimDiffView.frames.test.ts no file contents are loaded, so every hunk
 * ends in a "rest of the file" divider. The overflow and wrap markers are
 * not drawn yet, so a clipped line simply stops at the edge.
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

  test("on, a long line carries on in a row whose gutter is blank, sign and all", async () => {
    expect(await frameOf({ ...WRAPPED, wrap: true, comments: [comment("notes.ts", 2, "RIGHT")] })).toBe(`\
 ▼   notes.ts +1 -1
   1 export function note() {
   2   return 1
●  2   const message = "a fairly long line that keeps going
     a fairly long line that keeps going "
   3 }
     ▸ rest of the file  ↵`)
  })

  test("off, the same line is cut at the pane's edge", async () => {
    expect(await frameOf({ ...WRAPPED, wrap: false })).toBe(`\
 ▼   notes.ts +1 -1
   1 export function note() {
   2   return 1
   2   const message = "a fairly long line that keeps going
   3 }
     ▸ rest of the file  ↵`)
  })

  test("scrolled into a wrapped line, the top row is its continuation", async () => {
    expect(await frameOf({ ...WRAPPED, height: 3, wrap: true, scrollTop: 4 })).toBe(`\
     a fairly long line that keeps going "
   3 }
     ▸ rest of the file  ↵`)
  })
})

describe("sidescroll", () => {
  test("a column scrolls every line's code, the gutter and the chrome staying put", async () => {
    expect(await frameOf({ raw: ONE_WIDE_LINE, height: 6, column: 150 })).toBe(`\
 ▼   wide.ts +1 -1
   1
   2
   2 col170..col180..col190.."
     ▸ rest of the file  ↵`)
  })
})

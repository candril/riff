import { test, expect, describe, afterEach } from "bun:test"
import { ADDITION_BG } from "../diff-rows/line-colors"
import { fade } from "../diff-rows/segments"
import { SYNTAX_PALETTE } from "../diff-rows/syntax-palette"
import { FAR_HUNK, MANY_WRAPPED_LINES, MIXED_DIGITS, ONE_LONG_LINE, ONE_WIDE_LINE, THREE_FILES, TWO_FILES } from "../testing/diffs"
import { bgAt, fgAt, ints } from "../testing/split-frame"
import { mountUnified, type MountUnifiedOptions } from "../testing/unified-frame"
import { theme } from "../theme"
import type { Comment, FileReviewStatus } from "../types"
import { FILE_LABEL_PATH_X } from "./FullRow"

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

  test("a header under the cursor draws no block of its own: the terminal's cursor marks it", async () => {
    await frameOf({ raw: TWO_FILES, cursor: { line: 0 } })
    const spans = mounted!.setup.captureSpans()
    for (let x = 0; x < spans.lines[0]!.spans.reduce((width, span) => width + span.width, 0); x++) {
      expect(bgAt(spans, x, 0)).not.toEqual(ints(theme.rosewater))
    }
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

  // A single file, so no sticky header covers the top row.
  test("scrolled into a wrapped line, the top row is its continuation", async () => {
    // Six rows in a view of three, so the scrollbar shows, its thumb the lower half of the track.
    expect(await frameOf({ ...WRAPPED, height: 3, wrap: true, scrollTop: 3, mode: "single", selectedFileIndex: 0 })).toBe(`\
    ↳a fairly long line that keeps going "
   3 }${" ".repeat(53)}▄
     ▸ rest of the file  ↵${" ".repeat(33)}█`)
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

  /*
   * VimDiffView draws its › before flash and each label with setCell, so a label starting there
   * replaces the › whichever match came first. No parity case holds this: VimDiffView's recolorCell
   * throws on any flash match over its own › cell.
   */
  test("flash: a label starting on the › column replaces it, though an earlier match covers it too", async () => {
    const frame = await frameOf({
      raw: ONE_LONG_LINE,
      width: 60,
      height: 9,
      flash: [
        // "keeps going a", over the last code cell at 54.
        { line: 3, startCol: 43, endCol: 56, label: "a" },
        { line: 3, startCol: 54, endCol: 60, label: "s" },
      ],
    })
    expect(frame.split("\n")[3]!.at(-1)).toBe("s")
    expect([fgAt(spans(), 59, 3), bgAt(spans(), 59, 3)]).toEqual([ints(theme.base), ints(theme.red)])
  })

  // No parity case: VimDiffView's recolorCell throws on a match over the › it drew before flash, the order rightMarker in UnifiedLine.tsx keeps.
  test("flash: a label starting on the › column takes the colours of a match listed after it", async () => {
    const frame = await frameOf({
      raw: ONE_LONG_LINE,
      width: 60,
      height: 9,
      flash: [
        { line: 3, startCol: 54, endCol: 60, label: "a" },
        // "keeps going a", over the last code cell at 54.
        { line: 3, startCol: 43, endCol: 56, label: "s" },
      ],
    })
    expect(frame.split("\n")[3]!.at(-1)).toBe("a")
    expect([fgAt(spans(), 59, 3), bgAt(spans(), 59, 3)]).toEqual([ints(theme.text), ints(theme.surface1)])
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

describe("scrollbar", () => {
  const THUMB = /[▀▄█]/
  // Untrimmed, so a row's last cell is the pane's last column.
  const rowsOf = () => mounted!.setup.captureCharFrame().split("\n").slice(0, -1)
  const lastColumn = () => rowsOf().map((row) => row.at(-1))

  test("none while the diff fits, and a line past the edge has the pane's whole width", async () => {
    await frameOf({ raw: ONE_LONG_LINE, width: 60, height: 9 })
    expect(lastColumn().join("")).not.toMatch(THUMB)
    expect(rowsOf()[3]!.at(-1)).toBe("›")
  })

  test("a thumb in the last column once the diff overflows, moving as the view scrolls", async () => {
    await frameOf({ raw: TWO_FILES, width: 80, height: 6 })
    const atTop = lastColumn()
    expect(atTop.join("")).toMatch(THUMB)
    mounted!.set("scrollTop", 9)
    await mounted!.frame()
    const atEnd = lastColumn()
    expect(atEnd.join("")).toMatch(THUMB)
    expect(atEnd).not.toEqual(atTop)
  })

  // A bar the <Show> mounts afresh sets its sizes in whatever order Solid picks, and must still size its thumb by the window.
  test("a bar remounted as the pane grows past the diff and shrinks back draws the thumb a fresh mount draws", async () => {
    await frameOf({ raw: TWO_FILES, width: 80, height: 6 })
    const fresh = lastColumn()
    // Six rows of fourteen: two and a half cells of the six.
    expect(fresh.join("")).toBe("██▀   ")
    await mounted!.dispose()

    mounted = await mountUnified({ raw: TWO_FILES, width: 80, height: 20 })
    await mounted.frame()
    expect(lastColumn().join("")).not.toMatch(THUMB)
    mounted.set("height", 6)
    await mounted.frame()
    expect(lastColumn().slice(0, 6)).toEqual(fresh)
    mounted.set("height", 20)
    await mounted.frame()
    expect(lastColumn().join("")).not.toMatch(THUMB)
    mounted.set("height", 6)
    await mounted.frame()
    expect(lastColumn().slice(0, 6)).toEqual(fresh)
  })
})

describe("scrollbar beside unwrapped code twice the pane's width", () => {
  const THUMB = /[▀▄█]/
  const rowsOf = () => mounted!.setup.captureCharFrame().split("\n").slice(0, -1)

  // ONE_WIDE_LINE's content is 181 cells: VimDiffView's bar rounds off screen at 91 columns and stays at 92.
  test("pushed off at 91 columns, every row keeps the last column", async () => {
    await frameOf({ raw: ONE_WIDE_LINE, width: 91, height: 4 })
    const lastColumn = rowsOf().map((row) => row.at(-1))
    expect(lastColumn.join("")).not.toMatch(THUMB)
    expect(rowsOf()[3]!.at(-1)).toBe("›")
  })

  test("on screen at 92 columns, the › a column short of it", async () => {
    await frameOf({ raw: ONE_WIDE_LINE, width: 92, height: 4 })
    expect(rowsOf().map((row) => row.at(-1)).join("")).toMatch(THUMB)
    expect(rowsOf()[3]!.at(-2)).toBe("›")
  })
})

describe("sticky header", () => {
  const THUMB = /[▀▄█]/
  const rowsOf = () => mounted!.setup.captureCharFrame().split("\n")
  const headerRows = () =>
    mounted!.mapping.allLines.flatMap((line, index) => (line.type === "file-header" ? [index] : []))
  async function scrollTo(row: number) {
    mounted!.set("scrollTop", row)
    await mounted!.frame()
  }

  // As VimDiffView.frames.test.ts scrolls it, under the same header row.
  test("once a file's own header scrolls away, its name holds the top row", async () => {
    const frame = await frameOf({ raw: TWO_FILES, width: 80, height: 12, header: true, scrollTop: 2 })
    expect(frame).toBe(`
 ▼   src/greet.ts +2 -1
   2   return \`Hello \${name}\`
   3 }
   4                                                                           ▄
   5 export const version = 1                                                  █
     ▸ rest of the file  ↵                                                     █
                                                                               █
 ▼   src/farewell.ts +3 -0                                                     █
   1 export function farewell(name: string) {                                  █
   2   return "Bye " + name
   3 }`)
  })

  // VimDiffView's spans the scrollbar's column too, and hides the thumb on that row.
  test("it stops short of the scrollbar, so a thumb on the top row stays in sight", async () => {
    await frameOf({ raw: TWO_FILES, width: 80, height: 6, scrollTop: 1 })
    expect(rowsOf()[0]!).toStartWith(" ▼   src/greet.ts +2 -1 ")
    expect(rowsOf()[0]!.at(-1)).toMatch(THUMB)
  })

  test("none at the top, where the first header is the top row itself", async () => {
    await frameOf({ raw: TWO_FILES, width: 80, height: 6, scrollTop: 0 })
    expect(rowsOf()[1]!).toStartWith("   1 export function greet")
    expect(mounted!.setup.renderer.root.findDescendantById("sticky-file-header")).toBeUndefined()
  })

  test("none on a later header's own row, so the earlier file's name never covers it", async () => {
    await frameOf({ raw: TWO_FILES, width: 80, height: 6, scrollTop: 8 })
    expect(mounted!.setup.renderer.root.findDescendantById("sticky-file-header")).toBeDefined()
    expect(rowsOf()[0]!.trimEnd()).toBe(" ▼   src/greet.ts +2 -1")
    mounted!.set("scrollTop", 9)
    await mounted!.frame()
    expect(mounted!.setup.renderer.root.findDescendantById("sticky-file-header")).toBeUndefined()
    expect(rowsOf()[0]!.trimEnd()).toBe(" ▼   src/farewell.ts +3 -0")
    mounted!.set("scrollTop", 10)
    await mounted!.frame()
    expect(rowsOf()[0]!.trimEnd()).toBe(" ▼   src/farewell.ts +3 -0")
  })

  test("none in single-file mode, which has no header to pin", async () => {
    const frame = await frameOf({ raw: TWO_FILES, width: 80, height: 4, scrollTop: 2, mode: "single", selectedFileIndex: 0 })
    expect(frame).not.toContain("src/greet.ts")
    expect(rowsOf()[0]!).toStartWith("   2   return `Hello")
  })

  test("a viewed file's is ticked and its name greyed", async () => {
    const fileStatuses = new Map<string, FileReviewStatus>([["src/greet.ts", { filename: "src/greet.ts", viewed: true }]])
    await frameOf({ raw: TWO_FILES, width: 80, height: 6, scrollTop: 3, fileStatuses })
    expect(rowsOf()[0]!.trimEnd()).toBe(" ▼ ✓ src/greet.ts +2 -1")
    const spans = mounted!.setup.captureSpans()
    expect(fgAt(spans, 3, 0)).toEqual(ints(theme.green))
    expect(fgAt(spans, 5, 0)).toEqual(ints(theme.overlay1))
    expect(bgAt(spans, 5, 0)).toEqual(ints(theme.surface0))
  })

  test("over the continuation row of a wrapped line", async () => {
    const frame = await frameOf({ raw: MANY_WRAPPED_LINES, width: 40, height: 12, wrap: true, scrollTop: 3 })
    const rows = rowsOf()
    expect(rows[0]!).toStartWith(" ▼   wrapped.ts +60 -0 ")
    expect(rows[0]!.at(-1)).toMatch(THUMB)
    expect(rows[1]!).toMatch(/^\s+↳/)
    expect(frame).not.toContain("const line1 ")
  })

  // Faded from the path on, as the file's own header row fades, whatever the width of the gutter under it.
  test("under flash, its path and counts fade and its markers stay lit, with no label of its own", async () => {
    await frameOf({
      raw: TWO_FILES,
      width: 80,
      height: 6,
      scrollTop: 3,
      flash: [{ line: 3, startCol: 0, endCol: 2, label: "a" }],
    })
    expect(rowsOf()[0]!).toStartWith(" ▼   src/greet.ts +2 -1 ")
    const spans = mounted!.setup.captureSpans()
    expect(fgAt(spans, 1, 0)).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, 5, 0)).toEqual(ints(fade(theme.blue, theme.surface0)))
    expect(fgAt(spans, 18, 0)).toEqual(ints(fade(theme.green, theme.surface0)))
  })

  /*
   * VimDiffView counts each section one line short, so from the third file on it pins the next file's
   * name a row early. This view pins by where the header rows are and does not follow it.
   */
  test("across three files, each file's name is pinned exactly while its own rows are on top", async () => {
    await frameOf({ raw: THREE_FILES, width: 80, height: 8 })
    const third = headerRows()[2]!
    const sticky = () => mounted!.setup.renderer.root.findDescendantById("sticky-file-header")
    await scrollTo(third - 1)
    expect(rowsOf()[0]!.trimEnd()).toBe(" ▼   src/two.ts +1 -0")
    expect(sticky()).toBeDefined()
    await scrollTo(third)
    expect(rowsOf()[0]!.trimEnd()).toBe(" ▼   src/three.ts +1 -0")
    expect(sticky()).toBeUndefined()
    await scrollTo(third + 1)
    expect(rowsOf()[0]!.trimEnd()).toBe(" ▼   src/three.ts +1 -0")
    expect(sticky()).toBeDefined()
  })

  // VimDiffView pins it over that header, a row whose name it then hides.
  test("a collapsed file has no row to scroll into, so it is never pinned over the next file's header", async () => {
    await frameOf({
      raw: TWO_FILES,
      width: 80,
      height: 3,
      mappingOptions: { collapsedFiles: new Set(["src/greet.ts"]) },
    })
    const next = headerRows()[1]!
    await scrollTo(next)
    // Short of the last cell, where the scrollbar draws its thumb.
    expect(rowsOf()[0]!.slice(0, -1).trimEnd()).toBe(" ▼   src/farewell.ts +3 -0")
    expect(mounted!.setup.renderer.root.findDescendantById("sticky-file-header")).toBeUndefined()
    expect(rowsOf().some((row) => row.includes("▶"))).toBe(false)
    await scrollTo(next + 1)
    expect(rowsOf()[0]!).toStartWith(" ▼   src/farewell.ts +3 -0")
    expect(rowsOf()[1]!).toStartWith("   2   return")
  })

  // Faded from the path on at any gutter, where VimDiffView fades from the code column of the row under it.
  test("under flash beside a wider gutter, its path still fades from the label's own path cell", async () => {
    const far = "far.ts"
    await frameOf({ raw: MIXED_DIGITS, width: 80, height: 5 })
    const header = headerRows()[1]!
    mounted!.set("flash", [{ line: header + 2, startCol: 0, endCol: 2, label: "a" }])
    await scrollTo(header + 1)
    expect(rowsOf()[0]!).toStartWith(` ▼   ${far} `)
    expect(mounted!.setup.renderer.root.findDescendantById("sticky-file-header")).toBeDefined()
    const spans = mounted!.setup.captureSpans()
    expect(fgAt(spans, 1, 0)).toEqual(ints(theme.overlay0))
    const faded = ints(fade(theme.blue, theme.surface0))
    for (let x = FILE_LABEL_PATH_X; x < FILE_LABEL_PATH_X + far.length; x++) expect(fgAt(spans, x, 0)).toEqual(faded)
  })
})

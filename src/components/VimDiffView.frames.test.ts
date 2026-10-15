import { test, expect, describe, afterEach } from "bun:test"
import { mountDiffView, type MountDiffViewOptions } from "../testing/frame"
import type { Comment, FileReviewStatus } from "../types"

/*
 * What VimDiffView draws in unified mode, character for character. Colours
 * are not in a char frame, so added and deleted rows read alike here; what
 * these pin is the layout, the line numbers and riff's own chrome.
 *
 * No file contents are loaded, so riff cannot tell where a file ends and
 * every hunk is followed by a "rest of the file" divider — new files too.
 */

const TWO_FILES = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,5 +1,5 @@
 export function greet(name: string) {
-  return "Hello " + name
+  return \`Hello \${name}\`
 }
+
 export const version = 1
diff --git a/src/farewell.ts b/src/farewell.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/farewell.ts
@@ -0,0 +1,3 @@
+export function farewell(name: string) {
+  return "Bye " + name
+}
`

const FAR_HUNK = `diff --git a/schema.graphql b/schema.graphql
index 1111111..2222222 100644
--- a/schema.graphql
+++ b/schema.graphql
@@ -503,4 +503,5 @@ type TvAddOn {
   trackingId: Long @semanticNonNull
+  showSkipAdsChannelList: Boolean @semanticNonNull
   "Catalogue price, before any discount."
   monthlyPrice: Money @semanticNonNull
`

const LONG_LINE = `  const message = "${"a fairly long line that keeps going ".repeat(2)}"`
const ONE_LONG_LINE = `diff --git a/notes.ts b/notes.ts
index 1111111..2222222 100644
--- a/notes.ts
+++ b/notes.ts
@@ -1,3 +1,3 @@
 export function note() {
-  return 1
+${LONG_LINE}
 }
`

const WIDE_TEXT = Array.from({ length: 20 }, (_, i) => `col${String(i * 10).padStart(3, "0")}..`).join("")
const ONE_WIDE_LINE = `diff --git a/wide.ts b/wide.ts
index 1111111..2222222 100644
--- a/wide.ts
+++ b/wide.ts
@@ -1,2 +1,2 @@
 const short = 1
-const wide = 0
+const wide = "${WIDE_TEXT}"
`

let mounted: Awaited<ReturnType<typeof mountDiffView>> | null = null

async function mount(options: MountDiffViewOptions) {
  mounted = await mountDiffView(options)
  return mounted
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const rows = (frame: string) => frame.split("\n")

describe("all files", () => {
  test("draws each file's header, its numbered lines and a divider after each hunk", async () => {
    const frame = await (await mount({ raw: TWO_FILES })).frame()

    expect(rows(frame)[1]).toBe(" ▼   src/greet.ts +2 -1")
    expect(rows(frame)[10]).toBe(" ▼   src/farewell.ts +3 -0")
    expect(frame).toBe(`
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
})

describe("a single file", () => {
  test("draws only that file, under no header of its own", async () => {
    const frame = await (await mount({ raw: TWO_FILES, mode: "single", selectedFileIndex: 0 })).frame()

    expect(frame).not.toContain("src/greet.ts")
    expect(frame).not.toContain("farewell")
    expect(frame).toBe(`
   1 export function greet(name: string) {
   2   return "Hello " + name
   2   return \`Hello \${name}\`
   3 }
   4
   5 export const version = 1
     ▸ rest of the file  ↵`)
  })
})

describe("folds", () => {
  // collapsedHunks is accepted by DiffLineMapping but nothing reads it, so
  // there is no hunk fold to pin.
  test("a collapsed file is its header row alone, under a closed marker", async () => {
    const frame = await (await mount({
      raw: TWO_FILES,
      mappingOptions: { collapsedFiles: new Set(["src/farewell.ts"]) },
    })).frame()

    expect(rows(frame).at(-1)).toBe(" ▶   src/farewell.ts +3 -0")
    expect(frame).toBe(`
 ▼   src/greet.ts +2 -1
   1 export function greet(name: string) {
   2   return "Hello " + name
   2   return \`Hello \${name}\`
   3 }
   4
   5 export const version = 1
     ▸ rest of the file  ↵

 ▶   src/farewell.ts +3 -0`)
  })
})

describe("collapsed context", () => {
  test("a hunk far down the file is preceded by a divider counting the lines above it", async () => {
    const frame = await (await mount({ raw: FAR_HUNK })).frame()

    expect(rows(frame)[2]).toBe("      ▸ 502 lines  ↵")
    expect(frame).toBe(`
 ▼   schema.graphql +1 -0
      ▸ 502 lines  ↵
  503   trackingId: Long @semanticNonNull
  504   showSkipAdsChannelList: Boolean @semanticNonNull
  505   "Catalogue price, before any discount."
  506   monthlyPrice: Money @semanticNonNull
      ▸ rest of the file  ↵`)
  })
})

describe("wrap", () => {
  test("off, a line wider than the pane is clipped at an overflow marker", async () => {
    const frame = await (await mount({ raw: ONE_LONG_LINE, width: 60, height: 10 })).frame()

    expect(rows(frame)[4]).toEndWith("›")
    expect(frame).toBe(`
 ▼   notes.ts +1 -1
   1 export function note() {
   2   return 1
   2   const message = "a fairly long line that keeps going›
   3 }
     ▸ rest of the file  ↵`)
  })

  test("on, the same line carries on in a continuation row", async () => {
    const frame = await (await mount({ raw: ONE_LONG_LINE, width: 60, height: 10, wrap: true })).frame()

    expect(rows(frame)[5]).toStartWith("    ↳")
    expect(frame).toBe(`
 ▼   notes.ts +1 -1
   1 export function note() {
   2   return 1
   2   const message = "a fairly long line that keeps going
    ↳a fairly long line that keeps going "
   3 }
     ▸ rest of the file  ↵`)
  })
})

describe("sidescroll", () => {
  const WIDE_ROW = 3

  test("revealing a far column scrolls every line, the header staying put", async () => {
    const view = await mount({ raw: ONE_WIDE_LINE, height: 8 })
    await view.frame()
    expect(view.mapping.getLine(WIDE_ROW)!.type).toBe("addition")

    view.view.revealColumn(WIDE_ROW, 150)
    const frame = await view.frame()

    expect(rows(frame)[4]).toContain("col170..›")
    expect(frame).toBe(`
 ▼   wide.ts +1 -1
   1‹
   2‹
   2‹..col090..col100..col110..col120..col130..col140..col150..col160..col170..›
     ▸ rest of the file  ↵`)
  })

  test("the status bar is handed the column and width of a line wider than the pane only", async () => {
    const view = await mount({ raw: ONE_WIDE_LINE, height: 8 })
    await view.frame()

    expect(view.view.getColumnStatus(WIDE_ROW, 150)).toEqual({ col: 151, total: 175 })
    expect(view.view.getColumnStatus(1, 0)).toBeNull()
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

  test("a comment marks its row on either side, and a viewed file's header is ticked", async () => {
    const frame = await (await mount({
      raw: TWO_FILES,
      comments: [comment("right", "RIGHT"), comment("left", "LEFT")],
      fileStatuses: viewed,
    })).frame()

    expect(rows(frame)[3]).toBe(`●  2   return "Hello " + name`)
    expect(rows(frame)[10]).toBe(" ▼ ✓ src/farewell.ts +3 -0")
    expect(frame).toBe(`
 ▼   src/greet.ts +2 -1
   1 export function greet(name: string) {
●  2   return "Hello " + name
●  2   return \`Hello \${name}\`
   3 }
   4
   5 export const version = 1
     ▸ rest of the file  ↵

 ▼ ✓ src/farewell.ts +3 -0
   1 export function farewell(name: string) {
   2   return "Bye " + name
   3 }
     ▸ rest of the file  ↵`)
  })
})

describe("sticky header", () => {
  test("once a file's own header scrolls away, its name holds the top row", async () => {
    const view = await mount({ raw: TWO_FILES, height: 12 })
    await view.frame()

    const line = 6
    view.cursor.line = line
    view.view.updateCursor(view.cursor)
    view.view.scrollCursorTo(line, "top")
    const frame = await view.frame()

    expect(rows(frame)[1]).toBe(" ▼   src/greet.ts +2 -1")
    expect(rows(frame)[2]).toBe("   2   return `Hello ${name}`")
    expect(frame).toBe(`
 ▼   src/greet.ts +2 -1
   2   return \`Hello \${name}\`
   3 }
   4
   5 export const version = 1
     ▸ rest of the file  ↵                                                     ▄
                                                                               █
 ▼   src/farewell.ts +3 -0                                                     █
   1 export function farewell(name: string) {
   2   return "Bye " + name
   3 }`)
  })
})

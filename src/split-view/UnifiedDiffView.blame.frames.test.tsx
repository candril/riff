import { afterEach, describe, expect, test } from "bun:test"
import { BLAME_CELLS } from "../components/blame-column-model"
import type { BlameColumnState } from "../features/blame/column-state"
import type { BlameLine, FileBlame } from "../providers/blame/types"
import { LONG_LINE, ONE_LONG_LINE, TWO_FILES } from "../testing/diffs"
import { screenOf } from "../testing/screen"
import { bgAt, fgAt, ints } from "../testing/split-frame"
import { mountUnified, type MountUnifiedOptions } from "../testing/unified-frame"
import { theme } from "../theme"

/*
 * TWO_HUNKS has a removed line in its first hunk and a second hunk far
 * below, so one file shows a run, a base commit and a hunk boundary.
 */
const TWO_HUNKS = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
@@ -40,2 +40,2 @@
 far
 away
`

const commit = (shortSha: string, author: string): BlameLine => ({
  kind: "commit",
  commit: { sha: `${shortSha}${"0".repeat(32)}`, shortSha, author, date: "2026-01-01T00:00:00Z", subject: "s" },
})
const ADA = commit("aaaa1111", "Ada Lovelace")
const GRACE = commit("bbbb2222", "Grace")
const BASE = commit("cccc3333", "Linus")

/** Lines numbered from 1, each blamed on the commit at its position. */
const blameOf = (byLine: Record<number, BlameLine>): FileBlame => {
  const blame: (BlameLine | undefined)[] = []
  for (const [line, value] of Object.entries(byLine)) blame[Number(line)] = value
  return blame
}

const ready = (head: FileBlame | null, base: FileBlame | null): BlameColumnState => ({ status: "ready", head, base })

let mounted: Awaited<ReturnType<typeof mountUnified>> | null = null
afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

async function rowsWith(options: MountUnifiedOptions) {
  mounted = await mountUnified(options)
  await mounted.frame()
  return screenOf(mounted)
}

describe("unified's blame column", () => {
  test("off, the frame is the one UnifiedDiffView.frames.test.tsx expects of TWO_FILES, byte for byte", async () => {
    const without = (await rowsWith({ raw: TWO_FILES })).rows.join("\n")
    await mounted!.dispose()
    const off = (await rowsWith({ raw: TWO_FILES, blameColumns: new Map() })).rows.join("\n")
    expect(off).toBe(without)
    expect(mounted!.setup.captureCharFrame().split("\n").map((row) => row.trimEnd()).slice(0, 14).join("\n")).toBe(`\
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

  test("names a run once, again after a hunk boundary, and a deletion's base commit, with the code BLAME_CELLS further right", async () => {
    const plain = (await rowsWith({ raw: TWO_HUNKS })).rows
    await mounted!.dispose()
    const head = blameOf({ 1: ADA, 2: ADA, 3: ADA, 40: ADA, 41: GRACE })
    const base = blameOf({ 2: BASE })
    const screen = await rowsWith({ raw: TWO_HUNKS, blameColumns: new Map([["src/greet.ts", ready(head, base)]]) })
    expect(screen.rows.slice(1, 8).map((row) => row.trimEnd())).toEqual([
      "  aaaa1111 Ada Love   1 export function greet() {",
      "  cccc3333 Linus      2   return \"hi\"",
      "  aaaa1111 Ada Love   2   return \"hello\"",
      "                      3 }",
      "                        ▸ 36 lines  ↵",
      "  aaaa1111 Ada Love  40 far",
      "  bbbb2222 Grace     41 away",
    ])
    expect(screen.rows[1]!.indexOf("export")).toBe(plain[1]!.indexOf("export") + BLAME_CELLS)
    // Dimmed on the gutter's own background, as the number beside it is drawn.
    expect([fgAt(screen.spans, 2, 1), bgAt(screen.spans, 2, 1)]).toEqual([ints(theme.overlay0), ints(theme.mantle)])
    expect([fgAt(screen.spans, 2, 2), bgAt(screen.spans, 2, 2)]).toEqual([fgAt(screen.spans, 21, 2), bgAt(screen.spans, 21, 2)])
  })

  test("wrapped, a long line still breaks at the pane's edge less the wider gutter", async () => {
    const width = 60
    const screen = await rowsWith({
      raw: ONE_LONG_LINE,
      wrap: true,
      width,
      blameColumns: new Map([["notes.ts", ready(blameOf({ 1: ADA, 2: ADA, 3: ADA }), blameOf({ 2: BASE }))]]),
    })
    const origin = screen.rows[1]!.indexOf("export")
    expect(origin).toBe(2 + BLAME_CELLS + 4)
    const slices = screen.rows.slice(3, 6).map((row) => row.slice(origin).trimEnd())
    // Every slice fits the code's width, and together they are the whole line.
    for (const slice of slices) expect(slice.length).toBeLessThanOrEqual(width - origin - 1)
    expect(slices.join("").replaceAll(" ", "")).toStartWith(LONG_LINE.replaceAll(" ", ""))
    expect(screen.rows[4]!.slice(0, origin).trim()).toBe("↳")
  })

  test("in all files, a column on for one file leaves the other's gutter as it was", async () => {
    const plain = (await rowsWith({ raw: TWO_FILES })).rows
    await mounted!.dispose()
    const screen = await rowsWith({
      raw: TWO_FILES,
      blameColumns: new Map([["src/greet.ts", ready(blameOf({ 1: ADA, 2: ADA, 3: ADA, 4: ADA, 5: ADA }), null)]]),
    })
    const farewell = plain.findIndex((row) => row.includes("src/farewell.ts"))
    expect(farewell).toBeGreaterThan(0)
    expect(screen.rows.slice(farewell)).toEqual(plain.slice(farewell))
    expect(screen.rows[1]!.trimEnd()).toBe("  aaaa1111 Ada Love   1 export function greet(name: string) {")
  })

  test("while loading, … stands once at the top of the file's lines", async () => {
    const screen = await rowsWith({ raw: TWO_HUNKS, blameColumns: new Map([["src/greet.ts", { status: "loading" }]]) })
    expect(screen.rows.filter((row) => row.includes("…")).map((row) => row.trimEnd())).toEqual([
      "  …                   1 export function greet() {",
    ])
  })
})

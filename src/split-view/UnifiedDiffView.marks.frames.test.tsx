import { test, expect, describe, afterEach } from "bun:test"
import type { Mark } from "../features/marks/types"
import { markAt } from "../features/marks/capture"
import { followMarks } from "../features/marks/follow"
import { createMarksState } from "../features/marks/types"
import { deleteMark, setMark } from "../features/marks/store"
import { markSitsAt } from "../features/marks/toggle"
import { parseDiff } from "../utils/diff-parser"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { ONE_LONG_LINE, TWO_FILES } from "../testing/diffs"
import { charAt, screenOf } from "../testing/screen"
import { bgAt, fgAt, ints } from "../testing/split-frame"
import { mountUnified, type MountUnifiedOptions } from "../testing/unified-frame"
import { colors, theme } from "../theme"
import type { Comment } from "../types"

/*
 * A global mark's letter in unified's gutter, beside the comment sign, with
 * no header row above: TWO_FILES' line n is screen row n. Row 1 is greet.ts's
 * first context line, row 2 its removed line, row 9 farewell.ts's header.
 */

let mounted: Awaited<ReturnType<typeof mountUnified>> | null = null

async function screenWith(options: MountUnifiedOptions) {
  mounted = await mountUnified(options)
  await mounted.frame()
  return screenOf(mounted)
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const mark = (letter: string, filename: string, line: number | null, side: Mark["side"] = "RIGHT"): Mark => ({
  letter,
  filename,
  line,
  side,
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

describe("a marked line", () => {
  test("shows its letter in the gutter's second cell, in the mark colour over the gutter's own background", async () => {
    const screen = await screenWith({ raw: TWO_FILES, marks: [mark("a", "src/greet.ts", 1)] })
    expect(screen.rows[1]!.trimEnd()).toBe(" a  1 export function greet(name: string) {")
    expect([fgAt(screen.spans, 1, 1), bgAt(screen.spans, 1, 1)]).toEqual([ints(colors.markLetter), ints(theme.mantle)])
    expect(colors.markLetter).toBe(theme.mauve)
    // Only the marked row carries it.
    expect(screen.rows.filter((row) => row[1] === "a")).toHaveLength(1)
  })

  test("with a comment too, shows the sign and the letter side by side", async () => {
    const screen = await screenWith({
      raw: TWO_FILES,
      comments: [comment("src/greet.ts", 2, "LEFT")],
      marks: [mark("b", "src/greet.ts", 2, "LEFT")],
    })
    expect(screen.rows[2]!.trimEnd()).toBe(`●b  2   return "Hello " + name`)
    expect([fgAt(screen.spans, 0, 2), fgAt(screen.spans, 1, 2)]).toEqual([ints(theme.blue), ints(colors.markLetter)])
  })

  test("wrapped, shows the letter on its first row only, the ↳ row's cell blank", async () => {
    const screen = await screenWith({ raw: ONE_LONG_LINE, width: 61, height: 9, wrap: true, marks: [mark("c", "notes.ts", 2)] })
    expect(screen.rows[3]!).toStartWith(" c  2   const message")
    expect(screen.rows[4]!).toStartWith("     ↳")
  })

  test("appears and goes as the mark is set and deleted, with nothing else changing", async () => {
    await screenWith({ raw: TWO_FILES })
    const row = () => screenOf(mounted!).rows[1]!
    expect(row()[1]).toBe(" ")
    mounted!.set("marks", [mark("d", "src/greet.ts", 1)])
    await mounted!.frame()
    expect(row()[1]).toBe("d")
    mounted!.set("marks", [])
    await mounted!.frame()
    expect(row()[1]).toBe(" ")
  })

  test("m{letter} again on its row blanks the letter's cell and leaves the code where it was", async () => {
    await screenWith({ raw: TWO_FILES })
    const mapping = mounted!.mapping
    const marked = setMark(createMarksState(), markAt(mapping, 1, "a")!)
    mounted!.set("marks", [...marked.marks])
    await mounted!.frame()
    const before = screenOf(mounted!).rows[1]!
    expect(before[1]).toBe("a")

    expect(markSitsAt(mapping, marked.marks[0]!, 1, markAt(mapping, 1, "a")!, false)).toBe(true)
    mounted!.set("marks", [...deleteMark(marked, "a").marks])
    await mounted!.frame()
    const after = screenOf(mounted!).rows[1]!
    expect(after[1]).toBe(" ")
    expect(after.slice(2)).toBe(before.slice(2))
  })
})

describe("a file mark", () => {
  test("shows on the file's header row, in its first cell", async () => {
    const screen = await screenWith({ raw: TWO_FILES, marks: [mark("e", "src/farewell.ts", null)] })
    expect(screen.rows[9]!.trimEnd()).toBe("e▼   src/farewell.ts +3 -0")
    expect(charAt(screen, [0, 0])).toBe(" ")
    expect(fgAt(screen.spans, 0, 9)).toEqual(ints(colors.markLetter))
  })

  test("shows on the sticky header once the file has scrolled under it", async () => {
    const screen = await screenWith({ raw: TWO_FILES, height: 4, scrollTop: 10, marks: [mark("e", "src/farewell.ts", null)] })
    expect(screen.rows[0]!.trimEnd()).toBe("e▼   src/farewell.ts +3 -0")
    expect(fgAt(screen.spans, 0, 0)).toEqual(ints(colors.markLetter))
  })
})

describe("a mark after new commits shifted its file", () => {
  // TWO_FILES with two lines pushed in above greet.ts's first line.
  const SHIFTED = TWO_FILES.replace("@@ -1,5 +1,5 @@\n", "@@ -1,5 +1,7 @@\n+// one\n+// two\n")

  test("shows its letter on the row its text moved to, not on the old number", async () => {
    // Row 6 of TWO_FILES is new line 5, `export const version = 1`.
    const set = markAt(new DiffLineMapping(parseDiff(TWO_FILES), "all"), 6, "a")!
    expect(set).toMatchObject({ line: 5, text: "export const version = 1" })

    const { marks, moved } = followMarks([set], parseDiff(SHIFTED), "new-head")
    expect(moved).toBe(true)
    const screen = await screenWith({ raw: SHIFTED, marks })
    expect(screen.rows[8]!.trimEnd()).toBe(" a  7 export const version = 1")
    // New line 5 is now the closing brace, and carries no letter.
    expect(screen.rows[6]!.trimEnd()).toBe("    5 }")
    expect(screen.rows.filter((row) => row[1] === "a")).toHaveLength(1)
  })
})

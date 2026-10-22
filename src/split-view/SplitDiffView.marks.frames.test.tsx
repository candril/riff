import { test, expect, describe, afterEach } from "bun:test"
import type { Mark } from "../features/marks/types"
import { followMarks } from "../features/marks/follow"
import { markAt } from "../features/marks/capture"
import { emptyMarks } from "../features/marks/types"
import { deleteMark, setMark } from "../features/marks/store"
import { markSitsAt } from "../features/marks/toggle"
import { parseDiff } from "../utils/diff-parser"
import { TWO_FILES } from "../testing/diffs"
import { fgAt, ints, mountSplit, type MountSplitOptions } from "../testing/split-frame"
import { colors, theme } from "../theme"
import type { Comment } from "../types"

/*
 * A global mark's letter in split's gutters, at 120 columns: two 60-cell
 * panes, each gutter's second cell the letter's. Row 0 is greet.ts's
 * header, row 1 its first context line, in both halves.
 */

let mounted: Awaited<ReturnType<typeof mountSplit>> | null = null

async function rowsWith(options: MountSplitOptions) {
  mounted = await mountSplit(options)
  return (await mounted.frame()).split("\n")
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

const LEFT_LETTER = 1
const RIGHT_LETTER = 61

const mark = (letter: string, line: number | null, side: Mark["side"]): Mark => ({
  letter,
  filename: "src/greet.ts",
  line,
  side,
})

describe("a mark on a context line", () => {
  test("a RIGHT mark shows in the right half only", async () => {
    const rows = await rowsWith({ raw: TWO_FILES, marks: [mark("a", 1, "RIGHT")] })
    expect([rows[1]![LEFT_LETTER], rows[1]![RIGHT_LETTER]]).toEqual([" ", "a"])
    expect(fgAt(mounted!.setup.captureSpans(), RIGHT_LETTER, 1)).toEqual(ints(colors.markLetter))
  })

  test("a LEFT mark shows in the left half only", async () => {
    const rows = await rowsWith({ raw: TWO_FILES, marks: [mark("a", 1, "LEFT")] })
    expect([rows[1]![LEFT_LETTER], rows[1]![RIGHT_LETTER]]).toEqual(["a", " "])
  })

  test("a mark on each side of the same line shows each in its own half", async () => {
    const rows = await rowsWith({ raw: TWO_FILES, marks: [mark("b", 1, "RIGHT"), mark("a", 1, "LEFT")] })
    expect([rows[1]![LEFT_LETTER], rows[1]![RIGHT_LETTER]]).toEqual(["a", "b"])
  })

  test("beside a comment on the same half, both the sign and the letter show", async () => {
    const comment: Comment = {
      id: "c",
      filename: "src/greet.ts",
      line: 1,
      side: "RIGHT",
      body: "why?",
      createdAt: "2026-01-01T00:00:00.000Z",
      status: "local",
    }
    const rows = await rowsWith({ raw: TWO_FILES, comments: [comment], marks: [mark("a", 1, "RIGHT")] })
    expect(rows[1]!.slice(60, 66)).toBe("●a  1 ")
    const spans = mounted!.setup.captureSpans()
    expect([fgAt(spans, 60, 1), fgAt(spans, RIGHT_LETTER, 1)]).toEqual([ints(theme.blue), ints(colors.markLetter)])
  })

  test("m{letter} again on its row in its own pane blanks the letter's cell and leaves the code where it was", async () => {
    const before = await rowsWith({ raw: TWO_FILES })
    const mapping = mounted!.mapping
    const marked = setMark(emptyMarks(), markAt(mapping, 1, "a", "left")!)
    await mounted!.dispose()
    const shown = (await rowsWith({ raw: TWO_FILES, marks: [...marked.marks] }))[1]!
    expect(shown[LEFT_LETTER]).toBe("a")

    expect(markSitsAt(mapping, marked.marks[0]!, 1, markAt(mapping, 1, "a", "left")!, true)).toBe(true)
    await mounted!.dispose()
    const removed = (await rowsWith({ raw: TWO_FILES, marks: [...deleteMark(marked, "a").marks] }))[1]!
    expect(removed[LEFT_LETTER]).toBe(" ")
    expect(removed).toBe(before[1]!)
    expect(removed.slice(LEFT_LETTER + 1)).toBe(shown.slice(LEFT_LETTER + 1))
  })
})

describe("a file mark", () => {
  test("shows on the file's header row, whichever side it was set on", async () => {
    for (const side of ["LEFT", "RIGHT"] as const) {
      const rows = await rowsWith({ raw: TWO_FILES, marks: [mark("c", null, side)] })
      expect(rows[0]!.trimEnd()).toBe("c▼   src/greet.ts +2 -1")
      expect(fgAt(mounted!.setup.captureSpans(), 0, 0)).toEqual(ints(colors.markLetter))
      await mounted!.dispose()
      mounted = null
    }
  })
})

describe("a mark after new commits shifted its file", () => {
  // TWO_FILES with two lines pushed in above greet.ts's first line.
  const SHIFTED = TWO_FILES.replace("@@ -1,5 +1,5 @@\n", "@@ -1,5 +1,7 @@\n+// one\n+// two\n")

  test("shows its letter on the row its text moved to in the right half", async () => {
    const set = { ...mark("a", 5, "RIGHT"), text: "export const version = 1" }
    const { marks } = followMarks([set], parseDiff(SHIFTED), undefined)
    const rows = await rowsWith({ raw: SHIFTED, marks })
    const marked = rows.filter((row) => row[RIGHT_LETTER] === "a")
    expect(marked).toHaveLength(1)
    expect(marked[0]!.slice(RIGHT_LETTER - 1)).toContain("7 export const version = 1")
  })
})

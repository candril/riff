import { test, expect, describe } from "bun:test"
import { FAR_HUNK, MIXED_DIGITS, ONE_LONG_LINE, TWO_FILES } from "../testing/diffs"
import { mountDiffView, type MountDiffViewOptions } from "../testing/frame"
import { bgAt } from "../testing/split-frame"
import { mountUnified } from "../testing/unified-frame"
import type { Comment, FileReviewStatus } from "../types"
import type { SplitSelection } from "./overlays"

/*
 * The unified view against VimDiffView, mounted on the same diff at the
 * same size under the same header row. What VimDiffView paints after
 * layout — the ↳ and ‹ › markers, the cursor cell, the sticky header — the
 * new view does not draw yet, so the cases here stay clear of it. Tabs are
 * left out of the corpus.
 */

type Case = Omit<MountDiffViewOptions, "selectedFileIndex"> & { selectedFileIndex?: number }

async function framesOf(options: Case) {
  const old = await mountDiffView(options)
  const oldFrame = await old.frame()
  await old.dispose()
  const { wrap = false, ...rest } = options
  const fresh = await mountUnified({ ...rest, wrap, header: true })
  const freshFrame = await fresh.frame()
  await fresh.dispose()
  return { old: oldFrame, fresh: freshFrame }
}

const comment = (id: string, side: Comment["side"]): Comment => ({
  id,
  filename: "src/greet.ts",
  line: 2,
  side,
  body: "why?",
  createdAt: "2026-01-01T00:00:00.000Z",
  status: "local",
})

describe("the unified view draws what VimDiffView draws", () => {
  const cases: [string, Case][] = [
    ["all files", { raw: TWO_FILES }],
    ["a single file", { raw: TWO_FILES, mode: "single", selectedFileIndex: 0 }],
    ["the other single file", { raw: TWO_FILES, mode: "single", selectedFileIndex: 1 }],
    ["a collapsed file", { raw: TWO_FILES, mappingOptions: { collapsedFiles: new Set(["src/farewell.ts"]) } }],
    ["a hunk far down the file", { raw: FAR_HUNK }],
    ["a file per gutter width", { raw: MIXED_DIGITS }],
    [
      "comment signs and a viewed file",
      {
        raw: TWO_FILES,
        comments: [comment("right", "RIGHT"), comment("left", "LEFT")],
        fileStatuses: new Map<string, FileReviewStatus>([
          ["src/farewell.ts", { filename: "src/farewell.ts", viewed: true }],
        ]),
      },
    ],
  ]

  for (const [name, options] of cases) {
    test(name, async () => {
      const { old, fresh } = await framesOf(options)
      expect(fresh).toBe(old)
    })
  }

  // The narrow widths put a break on the last cell of a row, where one cell of wrap width decides it.
  const wrapped: [string, Case][] = [
    ["a long line", { raw: ONE_LONG_LINE, width: 60, height: 10 }],
    ["a long line, narrow", { raw: ONE_LONG_LINE, width: 25, height: 20, mode: "single", selectedFileIndex: 0 }],
    ["a long line, mid width", { raw: ONE_LONG_LINE, width: 40, height: 20, mode: "single", selectedFileIndex: 0 }],
    ["two files, a break on the last cell", { raw: TWO_FILES, width: 30, height: 40 }],
    ["a hunk far down the file, a break on the last cell", { raw: FAR_HUNK, width: 30, height: 30 }],
  ]

  for (const [name, options] of wrapped) {
    test(`wrapped, but for the continuation marker: ${name}`, async () => {
      const { old, fresh } = await framesOf({ ...options, wrap: true })
      expect(old).toContain("↳")
      expect(fresh).toBe(old.replaceAll("↳", " "))
    })
  }

  // VimDiffView's scrollbar takes the last column here; its code still wraps one cell short of it.
  test("wrapped under VimDiffView's scrollbar, but for the scrollbar's column", async () => {
    const { old, fresh } = await framesOf({ raw: FAR_HUNK, width: 30, height: 8, wrap: true })
    const withoutLastColumn = (frame: string) =>
      frame
        .split("\n")
        .map((row) => row.slice(0, 29).trimEnd())
        .join("\n")
    expect(old).toMatch(/[▀▄█]/)
    expect(withoutLastColumn(fresh)).toBe(withoutLastColumn(old.replaceAll("↳", " ")))
  })
})

describe("the unified view colours a line as VimDiffView does", () => {
  // TWO_FILES under the header row: each mapping line sits one screen row down.
  const CONTEXT = 1
  const DELETION = 2
  const ADDITION = 3
  const CURSOR = 4
  const SELECTED = 5
  const DIVIDER = 7
  const SPACING = 8
  // Both gutter edges, the first cell of code and one well past the end of every line.
  const CELLS = [0, 4, 5, 70]
  // VimDiffView paints its cursor cell over the first column of the cursor line.
  const CURSOR_CELLS = [0, 4, 10, 70]

  async function colours(cursorLine: number, anchor: number | null, lines: number[]) {
    const old = await mountDiffView({ raw: TWO_FILES })
    old.cursor.line = cursorLine
    if (anchor !== null) Object.assign(old.cursor, { mode: "visual-line", selectionAnchor: anchor })
    old.view.updateCursor(old.cursor)
    await old.frame()
    const selection: SplitSelection | null =
      anchor === null
        ? null
        : {
            mode: "visual-line",
            startRow: Math.min(anchor, cursorLine),
            endRow: Math.max(anchor, cursorLine),
            startCol: 0,
            endCol: 0,
          }
    const fresh = await mountUnified({ raw: TWO_FILES, header: true, cursor: { line: cursorLine }, selection })
    await fresh.frame()
    const read = (setup: typeof old.setup) => {
      const spans = setup.captureSpans()
      return lines.map((line) =>
        (line === cursorLine ? CURSOR_CELLS : CELLS).map((x) => ({ line, x, bg: bgAt(spans, x, line + 1) }))
      )
    }
    const result = { old: read(old.setup), fresh: read(fresh.setup) }
    await old.dispose()
    await fresh.dispose()
    return result
  }

  test("context, deletion, addition and the cursor line", async () => {
    const { old, fresh } = await colours(CURSOR, null, [CONTEXT, DELETION, ADDITION, CURSOR, DIVIDER, SPACING])
    expect(fresh).toEqual(old)
  })

  test("a linewise selection", async () => {
    const { old, fresh } = await colours(SELECTED + 1, SELECTED, [CONTEXT, SELECTED, SELECTED + 1])
    expect(fresh).toEqual(old)
  })
})

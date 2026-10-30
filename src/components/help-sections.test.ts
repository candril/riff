import { describe, test, expect } from "bun:test"
import { cellsOf } from "../diff-rows/cells"
import {
  HELP_BODY_ROWS,
  HELP_GAP,
  HELP_KEY_CELLS,
  HELP_MARGIN,
  HELP_PADDING,
  HELP_SECTIONS,
  helpColumnCells,
  helpColumns,
  helpLayout,
  helpRows,
  helpViewport,
} from "./help-sections"

const WIDE = 200

test("the left column runs Navigation to Chat, the right Panels & Files to GitHub & Other", () => {
  const [left, right] = helpColumns()
  expect(left.map((s) => s.title)).toEqual(["Navigation", "Search & Jump", "Folds & Context", "Selection", "Chat"])
  expect(right.map((s) => s.title)).toEqual(["Panels & Files", "Comments", "Comment composer", "GitHub & Other"])
  expect([...left, ...right]).toEqual([...HELP_SECTIONS])
})

test("Navigation lists gR beside the line peek, as the g chords spell it", () => {
  const keys = HELP_SECTIONS.find((s) => s.title === "Navigation")!.keys.map(([key]) => key)
  expect(keys.indexOf("gR")).toBe(keys.indexOf("gl") + 1)
})

test("every key leaves at least a cell before its description", () => {
  for (const { keys } of HELP_SECTIONS) {
    for (const [key] of keys) expect(cellsOf(key)).toBeLessThanOrEqual(HELP_KEY_CELLS - 1)
  }
})

test("the composer's section lists the keys its input handler binds", () => {
  const composer = HELP_SECTIONS.find((s) => s.title === "Comment composer")
  expect(composer?.keys.map(([key]) => key)).toEqual([
    "Enter / Ctrl+s",
    "Ctrl+p",
    "Ctrl+j",
    "Ctrl+y",
    "Ctrl+g",
    "Esc",
    "@ / :",
    "↑ ↓ / Ctrl+n/p",
    "Tab / Enter",
  ])
})

// The keys src/features/chat/keys.ts binds while the chat input has focus.
test("the chat's section lists the keys its input binds, next to Ctrl+r in the order of the sections", () => {
  const chat = HELP_SECTIONS.find((s) => s.title === "Chat")
  expect(chat?.keys.map(([key]) => key)).toEqual(["Enter", "Ctrl+j", "Shift+Enter", "Ctrl+g", "Ctrl+e", "@", "Esc", "Ctrl+n Ctrl+n"])
  expect(chat?.keys.find(([key]) => key === "@")?.[1]).toContain("@line @selection @file @pr")
  const titles = HELP_SECTIONS.map((s) => s.title)
  expect(titles.indexOf("Panels & Files")).toBe(titles.indexOf("Chat") + 1)
})

test("the chat's section sits in the column that keeps the taller of the two shortest", () => {
  const [left, right] = helpColumns().map(helpRows)
  const chatRows = helpRows(HELP_SECTIONS.filter((s) => s.title === "Chat")).length + 1
  expect(Math.max(left!.length, right!.length)).toBeLessThan(Math.max(left!.length - chatRows, right!.length + chatRows))
})

test("the body is as tall as the taller column", () => {
  const [left, right] = helpColumns()
  expect(HELP_BODY_ROWS).toBe(Math.max(helpRows(left).length, helpRows(right).length))
})

test("a gap parts the sections, and none trails the last", () => {
  const rows = helpRows(HELP_SECTIONS.slice(0, 2))
  const gaps = rows.flatMap((row, i) => (row.kind === "gap" ? [i] : []))
  expect(gaps).toEqual([HELP_SECTIONS[0]!.keys.length + 1])
  expect(rows[gaps[0]! + 1]).toMatchObject({ kind: "title", text: HELP_SECTIONS[1]!.title })
  expect(rows.at(-1)?.kind).toBe("key")
})

test("the viewport shows every row where they fit, and at least one where they do not", () => {
  expect(helpViewport(70, WIDE)).toEqual({ rows: HELP_BODY_ROWS, maxScroll: 0 })
  expect(helpViewport(40, WIDE)).toEqual({ rows: 32, maxScroll: HELP_BODY_ROWS - 32 })
  expect(helpViewport(5, WIDE).rows).toBe(1)
})

describe("the layout on a screen of a given width", () => {
  const [leftCells, rightCells] = helpColumns().map((sections) => helpColumnCells(helpRows(sections)))
  const twoColumns = leftCells! + HELP_GAP + rightCells! + 2 * HELP_PADDING

  test("two columns, exactly as wide as their widest rows, where both fit inside the margin", () => {
    const layout = helpLayout(twoColumns + 2 * HELP_MARGIN)
    expect(layout.columns.map((column) => column.cells)).toEqual([leftCells!, rightCells!])
    expect(layout.width).toBe(twoColumns)
    expect(layout.columns.map((column) => column.rows)).toEqual(helpColumns().map(helpRows))
  })

  test("one column of every section in order a cell narrower, each row whole while the screen has room", () => {
    const layout = helpLayout(twoColumns + 2 * HELP_MARGIN - 1)
    expect(layout.columns).toHaveLength(1)
    expect(layout.columns[0]!.rows).toEqual(helpRows(HELP_SECTIONS))
    expect(layout.columns[0]!.cells).toBe(Math.max(leftCells!, rightCells!))
  })

  test("below the one column's own width, the descriptions are cut at the overlay's edge with an ellipsis", () => {
    for (const screen of [85, 60, 30]) {
      const layout = helpLayout(screen)
      expect(layout.width).toBeLessThanOrEqual(screen - 2 * HELP_MARGIN)
      const [column] = layout.columns
      expect(column!.cells).toBe(layout.width - 2 * HELP_PADDING)
      for (const row of column!.rows) {
        if (row.kind === "key") expect(Math.max(HELP_KEY_CELLS, cellsOf(row.key)) + cellsOf(row.desc)).toBeLessThanOrEqual(Math.max(column!.cells, HELP_KEY_CELLS))
        if (row.kind === "title") expect(cellsOf(row.text)).toBeLessThanOrEqual(column!.cells)
      }
      expect(column!.rows.map((row) => row.id)).toEqual(helpRows(HELP_SECTIONS).map((row) => row.id))
    }
    const cut = helpLayout(85).columns[0]!.rows.find((row) => row.kind === "key" && row.desc.startsWith("Find in the diff"))
    expect(cut).toMatchObject({ kind: "key", desc: expect.stringMatching(/…$/) })
  })

  test("the viewport scrolls over the one column, which is taller than either of the two", () => {
    const rows = helpRows(HELP_SECTIONS).length
    expect(helpViewport(40, 80)).toEqual({ rows: 32, maxScroll: rows - 32 })
    expect(rows).toBeGreaterThan(HELP_BODY_ROWS)
  })
})

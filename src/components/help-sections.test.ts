import { test, expect } from "bun:test"
import { cellsOf } from "../diff-rows/cells"
import { HELP_BODY_ROWS, HELP_KEY_CELLS, HELP_SECTIONS, helpColumns, helpRows, helpViewport } from "./help-sections"

test("the left column runs Navigation to Selection, the right Panels & Files to GitHub & Other", () => {
  const [left, right] = helpColumns()
  expect(left.map((s) => s.title)).toEqual(["Navigation", "Search & Jump", "Folds & Context", "Selection"])
  expect(right.map((s) => s.title)).toEqual(["Panels & Files", "Comments", "Comment composer", "GitHub & Other"])
  expect([...left, ...right]).toEqual([...HELP_SECTIONS])
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

// 104 wide less padding, the gap and two key boxes leaves 30 cells per description.
test("the composer's descriptions fit beside their keys at the overlay's widest", () => {
  const composer = HELP_SECTIONS.find((s) => s.title === "Comment composer")!
  for (const [, desc] of composer.keys) expect(cellsOf(desc)).toBeLessThanOrEqual(30)
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
  expect(helpViewport(70)).toEqual({ rows: HELP_BODY_ROWS, maxScroll: 0 })
  expect(helpViewport(40)).toEqual({ rows: 32, maxScroll: HELP_BODY_ROWS - 32 })
  expect(helpViewport(5).rows).toBe(1)
})

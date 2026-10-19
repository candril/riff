import { describe, expect, test } from "bun:test"
import type { PrCheck } from "../providers/github"
import { checks } from "../testing/pr-info"
import { theme } from "../theme"
import { checkRows } from "./pr-info-check-rows"
import { flatCheckItems } from "./pr-info-items"
import type { ListRows } from "./pr-info-list-rows"

const NO_LABELS: ReadonlyMap<string, string> = new Map()
const FAILING = new Set([3, 4, 5, 6])

const rowsFor = (
  list: PrCheck[],
  { selected = -1, expanded = FAILING, labels = NO_LABELS }: { selected?: number; expanded?: Set<number>; labels?: ReadonlyMap<string, string> } = {}
) => checkRows(flatCheckItems(list, expanded, ""), { selected, labels, expanded, hasChecks: list.length > 0 })

const texts = (list: ListRows) => list.rows.map((row) => row.segments.map((segment) => segment.text).join(""))
const fgs = (list: ListRows, index: number) => list.rows[index]!.segments.map((segment) => segment.fg)

describe("checkRows", () => {
  test("draws each check, and under an expanded failing one its annotations or a placeholder", () => {
    const list = rowsFor(checks())
    expect(texts(list)).toEqual([
      "✓ build",
      "○ lint (in_progress)",
      "✗ test (failure)  ▼ [2]",
      "  • src/greet.ts:12:5",
      "  • src/farewell.ts",
      "✗ e2e (failure)  ▼",
      "  Loading annotations…",
      "✗ deploy (timed_out)  ▼",
      "  Could not fetch annotations",
      "! audit (action_required)  ▼",
      "  No annotations — press o to open log",
    ])
    expect(list.note).toBeNull()
  })

  test("colours a check's icon by status, its name subtext1, the rest overlay0", () => {
    const list = rowsFor(checks())
    expect(fgs(list, 0)).toEqual([theme.green, theme.subtext1])
    expect(fgs(list, 1)).toEqual([theme.yellow, theme.subtext1, theme.overlay0])
    expect(fgs(list, 2)).toEqual([theme.red, theme.subtext1, theme.overlay0, theme.overlay0])
    expect(fgs(list, 9)).toEqual([theme.peach, theme.subtext1, theme.overlay0, theme.overlay0])
  })

  test("colours an annotation's bullet by level, its location subtext1, its message overlay0 below", () => {
    const list = rowsFor(checks())
    expect(fgs(list, 3)).toEqual([theme.overlay0, theme.red, theme.subtext1])
    expect(fgs(list, 4)).toEqual([theme.overlay0, theme.yellow, theme.subtext1])
    expect(list.rows[3]!.below).toEqual([{ text: "      Expected 2, got 3", fg: theme.overlay0 }])
    expect(list.rows[4]!.below).toEqual([{ text: "      Unused export", fg: theme.overlay0 }])
    const notice = checks()
    notice[2]!.annotations![0]!.level = "notice"
    expect(fgs(rowsFor(notice), 3)[1]).toBe(theme.subtext0)
  })

  test("draws a placeholder overlay0, and only annotations carry a second line", () => {
    const list = rowsFor(checks())
    for (const index of [6, 8, 10]) expect(fgs(list, index)).toEqual([theme.overlay0])
    expect(list.rows.filter((row) => row.below).length).toBe(2)
  })

  test("draws the selected check's name and the selected annotation's location in text", () => {
    const onCheck = rowsFor(checks(), { selected: 2 })
    expect(onCheck.rows.map((row) => row.selected).indexOf(true)).toBe(2)
    expect(fgs(onCheck, 2)[1]).toBe(theme.text)
    const onAnnotation = rowsFor(checks(), { selected: 3 })
    expect(fgs(onAnnotation, 3)[2]).toBe(theme.text)
    expect(fgs(onAnnotation, 2)[1]).toBe(theme.subtext1)
    expect(fgs(rowsFor(checks(), { selected: 6 }), 6)).toEqual([theme.overlay0])
  })

  test("counts annotations only when there are some, and folds a collapsed check", () => {
    expect(texts(rowsFor(checks(), { expanded: new Set() }))).toEqual([
      "✓ build",
      "○ lint (in_progress)",
      "✗ test (failure)  ▶ [2]",
      "✗ e2e (failure)  ▶",
      "✗ deploy (timed_out)  ▶",
      "! audit (action_required)  ▶",
    ])
  })

  test("drops the line and column of a file-level annotation, and keeps a line without a column", () => {
    const list = checks()
    list[2]!.annotations![0]!.startColumn = undefined
    expect(texts(rowsFor(list))[3]).toBe("  • src/greet.ts:12")
    expect(texts(rowsFor(list))[4]).toBe("  • src/farewell.ts")
  })

  test("gives an annotation without a message an empty second line", () => {
    const list = checks()
    list[2]!.annotations![1]!.message = ""
    expect(rowsFor(list).rows[4]!.below).toEqual([{ text: "", fg: theme.overlay0 }])
  })

  test("says there are no checks only when the PR has none, and nothing when the filter hides them", () => {
    expect(rowsFor([])).toEqual({ rows: [], note: "No checks configured" })
    const hidden = checkRows(flatCheckItems(checks(), FAILING, "matches-nothing"), {
      selected: -1,
      labels: NO_LABELS,
      expanded: FAILING,
      hasChecks: true,
    })
    expect(hidden).toEqual({ rows: [], note: null })
  })

  test("keys rows by what they show, the same across a cursor move and an expansion", () => {
    const keys = (list: ListRows) => list.rows.map((row) => row.key)
    const open = keys(rowsFor(checks()))
    expect(open.slice(2, 7)).toEqual(["check:3", "annotation:3:0", "annotation:3:1", "check:4", "placeholder:4"])
    expect(keys(rowsFor(checks(), { selected: 5 }))).toEqual(open)
    const folded = keys(rowsFor(checks(), { expanded: new Set([3]) }))
    expect(folded).toEqual(["check:1", "check:2", "check:3", "annotation:3:0", "annotation:3:1", "check:4", "check:5", "check:6"])
  })

  test("labels rows by their index in the section", () => {
    const list = rowsFor(checks(), { labels: new Map([["checks:2", "a"], ["checks:3", "sd"], ["files:3", "x"]]) })
    expect(list.rows.map((row) => row.label)).toEqual([undefined, undefined, "a", "sd", ...Array(7).fill(undefined)])
  })
})

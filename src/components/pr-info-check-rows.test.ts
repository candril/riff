import { describe, expect, test } from "bun:test"
import type { PrCheck } from "../providers/github/types"
import { checks } from "../testing/pr-info"
import { theme } from "../theme"
import type { MergePoint } from "./merge-status-model"
import { checkRows } from "./pr-info-check-rows"
import { flatCheckItems, isExpandablePoint } from "./pr-info-items"
import type { ListRows } from "./pr-info-list-rows"

const NO_LABELS: ReadonlyMap<string, string> = new Map()
const FAILING = new Set([3, 4, 5, 6])
const CHECKS_POINT: MergePoint = { id: "checks", state: "fail", text: "1/6 · test, e2e +2 failing" }
const POINTS: MergePoint[] = [
  CHECKS_POINT,
  { id: "reviews", state: "ok", text: "2/2 approvals" },
  { id: "blockers", state: "fail", text: "draft" },
  { id: "blockers", state: "info", text: "auto-merge armed (squash)" },
]

const rowsOf = (
  points: MergePoint[],
  list: PrCheck[],
  { selected = -1, expanded = FAILING, labels = NO_LABELS, open = true, filter = "" }: {
    selected?: number
    expanded?: Set<number>
    labels?: ReadonlyMap<string, string>
    open?: boolean
    filter?: string
  } = {}
) =>
  checkRows(
    flatCheckItems(points, list, {
      expandedCheckIds: expanded,
      expandedPoints: new Set(open ? (["checks"] as const) : []),
      filter,
    }),
    { selected, labels, expanded, expandable: (point) => isExpandablePoint(point, list) }
  )

/** The checks line, and the checks open under it. Row 0 is the line itself. */
const rowsFor = (list: PrCheck[], options: Parameters<typeof rowsOf>[2] = {}) => rowsOf([CHECKS_POINT], list, options)

const texts = (list: ListRows) => list.rows.map((row) => row.segments.map((segment) => segment.text).join(""))
const fgs = (list: ListRows, index: number) => list.rows[index]!.segments.map((segment) => segment.fg)

describe("merge status lines", () => {
  test("draw the icon, the label padded to the longest, then the text, and only the checks line folds", () => {
    expect(texts(rowsOf(POINTS, checks(), { open: false }))).toEqual([
      "✗ Checks         1/6 · test, e2e +2 failing  ▶",
      "✓ Reviews        2/2 approvals",
      "✗ Blockers       draft",
      "ℹ                auto-merge armed (squash)",
    ])
  })

  test("colour the icon by state, the label subtext0, the text subtext1 or text under the cursor, the fold overlay0", () => {
    const list = rowsOf(POINTS, checks(), { open: false, selected: 1 })
    expect(fgs(list, 0)).toEqual([theme.red, theme.subtext0, theme.subtext1, theme.overlay0])
    expect(fgs(list, 1)).toEqual([theme.green, theme.subtext0, theme.text])
    expect(fgs(list, 3)[0]).toBe(theme.blue)
  })

  test("the checks line does not fold without checks", () => {
    expect(texts(rowsOf([{ id: "checks", state: "ok", text: "no checks" }], []))).toEqual(["✓ Checks         no checks"])
  })

  test("are keyed by gate, a second blocker by its place among them", () => {
    expect(rowsOf(POINTS, checks(), { open: false }).rows.map((row) => row.key)).toEqual([
      "point:checks",
      "point:reviews",
      "point:blockers",
      "point:blockers:1",
    ])
  })
})

describe("checkRows", () => {
  test("draws each check, and under an expanded failing one its annotations or a placeholder", () => {
    const list = rowsFor(checks())
    expect(texts(list)).toEqual([
      "✗ Checks         1/6 · test, e2e +2 failing  ▼",
      "  ✓ build",
      "  ○ lint (in_progress)",
      "  ✗ test (failure)  ▼ [2]",
      "    • src/greet.ts:12:5",
      "    • src/farewell.ts",
      "  ✗ e2e (failure)  ▼",
      "    Loading annotations…",
      "  ✗ deploy (timed_out)  ▼",
      "    Could not fetch annotations",
      "  ! audit (action_required)  ▼",
      "    No annotations — press o to open log",
    ])
    expect(list.note).toBeNull()
  })

  test("colours a check's icon by status, its name subtext1, the rest overlay0", () => {
    const list = rowsFor(checks())
    expect(fgs(list, 1)).toEqual([theme.green, theme.subtext1])
    expect(fgs(list, 2)).toEqual([theme.yellow, theme.subtext1, theme.overlay0])
    expect(fgs(list, 3)).toEqual([theme.red, theme.subtext1, theme.overlay0, theme.overlay0])
    expect(fgs(list, 10)).toEqual([theme.peach, theme.subtext1, theme.overlay0, theme.overlay0])
  })

  test("colours an annotation's bullet by level, its location subtext1, its message overlay0 below", () => {
    const list = rowsFor(checks())
    expect(fgs(list, 4)).toEqual([theme.overlay0, theme.red, theme.subtext1])
    expect(fgs(list, 5)).toEqual([theme.overlay0, theme.yellow, theme.subtext1])
    expect(list.rows[4]!.below).toEqual([{ text: "        Expected 2, got 3", fg: theme.overlay0 }])
    expect(list.rows[5]!.below).toEqual([{ text: "        Unused export", fg: theme.overlay0 }])
    const notice = checks()
    notice[2]!.annotations![0]!.level = "notice"
    expect(fgs(rowsFor(notice), 4)[1]).toBe(theme.subtext0)
  })

  test("draws a placeholder overlay0, and only annotations carry a second line", () => {
    const list = rowsFor(checks())
    for (const index of [7, 9, 11]) expect(fgs(list, index)).toEqual([theme.overlay0])
    expect(list.rows.filter((row) => row.below).length).toBe(2)
  })

  test("draws the selected check's name and the selected annotation's location in text", () => {
    const onCheck = rowsFor(checks(), { selected: 3 })
    expect(onCheck.rows.map((row) => row.selected).indexOf(true)).toBe(3)
    expect(fgs(onCheck, 3)[1]).toBe(theme.text)
    const onAnnotation = rowsFor(checks(), { selected: 4 })
    expect(fgs(onAnnotation, 4)[2]).toBe(theme.text)
    expect(fgs(onAnnotation, 3)[1]).toBe(theme.subtext1)
    expect(fgs(rowsFor(checks(), { selected: 7 }), 7)).toEqual([theme.overlay0])
  })

  test("counts annotations only when there are some, and folds a collapsed check", () => {
    expect(texts(rowsFor(checks(), { expanded: new Set() })).slice(1)).toEqual([
      "  ✓ build",
      "  ○ lint (in_progress)",
      "  ✗ test (failure)  ▶ [2]",
      "  ✗ e2e (failure)  ▶",
      "  ✗ deploy (timed_out)  ▶",
      "  ! audit (action_required)  ▶",
    ])
  })

  test("drops the line and column of a file-level annotation, and keeps a line without a column", () => {
    const list = checks()
    list[2]!.annotations![0]!.startColumn = undefined
    expect(texts(rowsFor(list))[4]).toBe("    • src/greet.ts:12")
    expect(texts(rowsFor(list))[5]).toBe("    • src/farewell.ts")
  })

  test("gives an annotation without a message an empty second line", () => {
    const list = checks()
    list[2]!.annotations![1]!.message = ""
    expect(rowsFor(list).rows[5]!.below).toEqual([{ text: "", fg: theme.overlay0 }])
  })

  test("draw nothing when the filter hides every line and check", () => {
    expect(rowsFor(checks(), { filter: "matches-nothing" })).toEqual({ rows: [], note: null })
  })

  test("keys rows by what they show, the same across a cursor move and an expansion", () => {
    const keys = (list: ListRows) => list.rows.map((row) => row.key)
    const open = keys(rowsFor(checks()))
    expect(open.slice(3, 8)).toEqual(["check:3", "annotation:3:0", "annotation:3:1", "check:4", "placeholder:4"])
    expect(keys(rowsFor(checks(), { selected: 6 }))).toEqual(open)
    const folded = keys(rowsFor(checks(), { expanded: new Set([3]) }))
    expect(folded).toEqual([
      "point:checks", "check:1", "check:2", "check:3", "annotation:3:0", "annotation:3:1", "check:4", "check:5", "check:6",
    ])
  })

  test("labels rows by their index in the section", () => {
    const list = rowsFor(checks(), { labels: new Map([["checks:0", "f"], ["checks:3", "a"], ["checks:4", "sd"], ["files:3", "x"]]) })
    expect(list.rows.map((row) => row.label)).toEqual(["f", undefined, undefined, "a", "sd", ...Array(7).fill(undefined)])
  })
})

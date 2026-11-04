import { describe, test, expect } from "bun:test"
import { actionMenuModel, getVisualActionOrder } from "./action-menu-model"
import { theme } from "../theme"
import type { ResolvedAction } from "../actions"

function action(id: string, category?: string, shortcut?: string): ResolvedAction {
  return { id, label: id.toUpperCase(), description: "", category: category as ResolvedAction["category"], shortcut, available: () => true }
}

/** Tall enough that no list here is cut to the terminal. */
const TALL = 60

const ACTIONS = [
  action("quit", "general", "q"),
  action("custom", "plugins"),
  action("split", "view", "s"),
  action("ask", "claude"),
  action("bare"),
  action("pr", "github", "o"),
  action("other", "claude"),
]

describe("actionMenuModel", () => {
  test("groups the actions under their categories in category order, unknown categories last", () => {
    const { title, hint, rows } = actionMenuModel({ kind: "actions", actions: ACTIONS }, 0, TALL)
    expect({ title, hint }).toEqual({ title: "Commands", hint: "esc" })
    expect(rows.map((row) => row.id)).toEqual([
      "cat:Claude", "ask", "other",
      "cat:GitHub", "pr",
      "cat:View", "split",
      "cat:General", "quit", "bare",
      "cat:plugins", "custom",
    ])
    expect(getVisualActionOrder(ACTIONS).map((a) => a.id)).toEqual(["ask", "other", "pr", "split", "quit", "bare", "custom"])
  })

  test("everything in view says nothing lies beyond it", () => {
    expect(actionMenuModel({ kind: "actions", actions: ACTIONS }, 0, TALL)).toMatchObject({ above: 0, below: 0 })
  })

  test("selects by the place in visual order, across the groups", () => {
    const rows = actionMenuModel({ kind: "actions", actions: ACTIONS }, 3, TALL).rows
    expect(rows.filter((row) => row.kind === "action" && row.selected).map((row) => row.id)).toEqual(["split"])
    expect(rows.find((row) => row.id === "split")).toMatchObject({ labelFg: theme.text, shortcut: "s" })
    expect(rows.find((row) => row.id === "ask")).toMatchObject({ labelFg: theme.subtext1, shortcut: null })
  })

  test("a submenu says esc to back unless it brings its own hint", () => {
    const rows = [{ id: "r", label: "Heart", icon: "♥" }]
    expect(actionMenuModel({ kind: "submenu", title: "React", rows }, 0, TALL)).toMatchObject({ title: "React", hint: "esc to back" })
    expect(actionMenuModel({ kind: "submenu", title: "Links", hint: "esc", rows }, 0, TALL).hint).toBe("esc")
  })

  test("a submenu row joins its icon to the label and colours an accented note green", () => {
    const rows = actionMenuModel(
      {
        kind: "submenu",
        title: "React",
        rows: [
          { id: "a", icon: "♥", label: "Heart", trailing: "you reacted", accented: true },
          { id: "b", label: "Plain", trailing: "" },
        ],
      },
      1,
      TALL
    ).rows
    expect(rows).toEqual([
      {
        kind: "submenu",
        id: "a",
        label: "♥  Heart",
        labelSpans: [{ text: "♥  Heart", matched: false }],
        labelFg: theme.text,
        trailing: "you reacted",
        trailingSpans: [{ text: "you reacted", matched: false }],
        trailingFg: theme.green,
        accented: true,
        selected: false,
      },
      {
        kind: "submenu",
        id: "b",
        label: "Plain",
        labelSpans: [{ text: "Plain", matched: false }],
        labelFg: theme.text,
        trailing: null,
        trailingSpans: [],
        trailingFg: theme.overlay0,
        accented: false,
        selected: true,
      },
    ])
  })
})

describe("actionMenuModel on a short terminal", () => {
  const many = Array.from({ length: 40 }, (_, i) => action(`a${i}`, ["claude", "github", "view", "general"][Math.floor(i / 10)]))
  // 24 rows leave 15 for the list: PickerFrame takes 9.
  const lines = (rows: ReturnType<typeof actionMenuModel>["rows"]) =>
    rows.reduce((sum, row) => sum + (row.kind === "category" ? 2 : 1), 0)

  test("draws the header of every group in view, the first one too, and counts the rest as beyond", () => {
    const model = actionMenuModel({ kind: "actions", actions: many }, 39, 24)
    const actions = model.rows.filter((row) => row.kind === "action")
    expect(actions.at(-1)).toMatchObject({ id: "a39", selected: true })
    expect(model.rows[0]).toEqual({ kind: "category", id: "cat:View", label: "View" })
    expect(model.rows.filter((row) => row.kind === "category").map((row) => row.label)).toEqual(["View", "General"])
    expect(model).toMatchObject({ above: 40 - actions.length, below: 0 })
    expect(lines(model.rows)).toBeLessThanOrEqual(15)
  })

  test("counts the headers once they would overflow the screen, so a group boundary costs entries", () => {
    const model = actionMenuModel({ kind: "actions", actions: many }, 20, 24)
    expect(model.rows.map((row) => row.id)).toEqual([
      "cat:GitHub", "a15", "a16", "a17", "a18", "a19",
      "cat:View", "a20", "a21", "a22", "a23", "a24", "a25",
    ])
    expect(model).toMatchObject({ above: 15, below: 14 })
  })

  test("caps the entries at twenty on a tall terminal, the headers not counted", () => {
    const model = actionMenuModel({ kind: "actions", actions: many }, 20, 60)
    expect(model.rows.filter((row) => row.kind === "action")).toHaveLength(20)
    expect(model.rows.filter((row) => row.kind === "category")).toHaveLength(2)
    expect(model).toMatchObject({ above: 10, below: 10 })
  })

  for (const height of [10, 11]) {
    for (const selected of [0, 20, 39]) {
      test(`keeps the list within its room at height ${height}, selection ${selected} in view, a header dropped before it`, () => {
        const model = actionMenuModel({ kind: "actions", actions: many }, selected, height)
        expect(lines(model.rows)).toBeLessThanOrEqual(height - 9)
        expect(model.rows.filter((row) => row.kind === "category")).toEqual([])
        expect(model.rows.find((row) => row.kind === "action" && row.selected)).toMatchObject({ id: `a${selected}` })
      })
    }
  }

  test("keeps the headers where the selection and its header fit", () => {
    const model = actionMenuModel({ kind: "actions", actions: many }, 20, 12)
    expect(model.rows.map((row) => row.id)).toEqual(["cat:View", "a20"])
  })

  test("windows a submenu as pickerWindow does", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, label: `R${i}` }))
    const model = actionMenuModel({ kind: "submenu", title: "Links", rows }, 10, 24)
    expect(model.rows.map((row) => row.id)).toEqual(Array.from({ length: 15 }, (_, i) => `r${i + 3}`))
    expect(model).toMatchObject({ above: 3, below: 12 })
  })
})

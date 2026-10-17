import { describe, test, expect } from "bun:test"
import { actionMenuModel, getVisualActionOrder } from "./action-menu-model"
import { theme } from "../theme"
import type { ResolvedAction } from "../actions"

function action(id: string, category?: string, shortcut?: string): ResolvedAction {
  return { id, label: id.toUpperCase(), description: "", category: category as ResolvedAction["category"], shortcut, available: () => true }
}

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
    const { title, hint, rows } = actionMenuModel({ kind: "actions", actions: ACTIONS }, 0)
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

  test("selects by the place in visual order, across the groups", () => {
    const rows = actionMenuModel({ kind: "actions", actions: ACTIONS }, 3).rows
    expect(rows.filter((row) => row.kind === "action" && row.selected).map((row) => row.id)).toEqual(["split"])
    expect(rows.find((row) => row.id === "split")).toMatchObject({ labelFg: theme.text, shortcut: "s" })
    expect(rows.find((row) => row.id === "ask")).toMatchObject({ labelFg: theme.subtext1, shortcut: null })
  })

  test("a submenu says esc to back unless it brings its own hint", () => {
    const rows = [{ id: "r", label: "Heart", icon: "♥" }]
    expect(actionMenuModel({ kind: "submenu", title: "React", rows }, 0)).toMatchObject({ title: "React", hint: "esc to back" })
    expect(actionMenuModel({ kind: "submenu", title: "Links", hint: "esc", rows }, 0).hint).toBe("esc")
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
      1
    ).rows
    expect(rows).toEqual([
      { kind: "submenu", id: "a", label: "♥  Heart", labelFg: theme.text, trailing: "you reacted", trailingFg: theme.green, accented: true, selected: false },
      { kind: "submenu", id: "b", label: "Plain", labelFg: theme.text, trailing: null, trailingFg: theme.overlay0, accented: false, selected: true },
    ])
  })
})

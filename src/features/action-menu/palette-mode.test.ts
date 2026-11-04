import { describe, expect, test } from "bun:test"
import { paletteMode } from "./palette-mode"
import { getAvailableActions } from "../../actions"
import { createInitialState } from "../../state"
import { createCursorState } from "../../vim-diff/cursor-state"
import type { ActionSubmenu } from "../../actions/types"
import { createActionMenuState } from "./state"
import { actionMenuModel } from "../../components/action-menu-model"

const vim = createCursorState()
const state = createInitialState([], [], "local", "local changes")
const links = [{ label: "#1", url: "https://example.com/1" }]
const target = { kind: "issue", prNumber: 1 } as const

function palette(setup: (actionMenu: ReturnType<typeof createActionMenuState>) => void = () => {}) {
  const actionMenu = createActionMenuState()
  actionMenu.show()
  setup(actionMenu)
  return actionMenu.snapshot()
}

function hintOf(submenu: ActionSubmenu) {
  const mode = paletteMode(state, vim, palette((actionMenu) => actionMenu.showSubmenu(submenu)), { reactionTarget: null })
  return mode.kind === "submenu" ? mode.hint : "not a submenu"
}

describe("paletteMode", () => {
  test("lists every available action until something is typed, then the ones matching it", () => {
    const all = getAvailableActions(state, vim, { reactionTarget: null })
    expect(paletteMode(state, vim, palette(), { reactionTarget: null })).toEqual({ kind: "actions", actions: all })
    const narrowed = paletteMode(state, vim, palette((actionMenu) => actionMenu.setQuery("quit")), { reactionTarget: null })
    expect(narrowed.kind === "actions" && narrowed.actions.length).toBeLessThan(all.length)
  })

  test("names Enter's job for a list of links, and esc alone for a submenu with no palette behind it", () => {
    expect(hintOf({ kind: "links", links, action: "copy", title: "Links" })).toBe("enter copy · esc")
    expect(hintOf({ kind: "links", links, action: "open", title: "Links" })).toBe("enter open · ctrl-y copy · esc")
    expect(hintOf({ kind: "react", target, title: "React", fromPalette: false })).toBe("esc")
    expect(hintOf({ kind: "react", target, title: "React", fromPalette: true })).toBeUndefined()
  })
})

describe("paletteMode: highlighted matches (spec 007)", () => {
  const modeFor = (query: string) => paletteMode(state, vim, palette((actionMenu) => actionMenu.setQuery(query)), { reactionTarget: null })

  test("keeps where the query matched each action's label, and the row draws it", () => {
    const mode = modeFor("quit")
    expect(mode.kind === "actions" && mode.labelMatches?.get("quit")).toEqual([0, 1, 2, 3])
    const row = actionMenuModel(mode, 0, 60).rows.find((r) => r.id === "quit")
    expect(row?.kind === "action" && row.labelSpans).toEqual([{ text: "Quit", matched: true }])
  })

  test("a scattered query picks out its characters in the label", () => {
    const mode = modeFor("tfp")
    const row = actionMenuModel(mode, 0, 60).rows.find((r) => r.kind === "action" && r.label === "Toggle File Panel")
    expect(row?.kind === "action" && row.labelSpans).toEqual([
      { text: "T", matched: true },
      { text: "oggle ", matched: false },
      { text: "F", matched: true },
      { text: "ile ", matched: false },
      { text: "P", matched: true },
      { text: "anel", matched: false },
    ])
  })

  test("every highlighted label spells the query, and no query highlights nothing", () => {
    const mode = modeFor("le")
    const highlighted = mode.kind === "actions" ? [...(mode.labelMatches ?? [])] : []
    expect(highlighted.length).toBeGreaterThan(0)
    for (const [id, positions] of highlighted) {
      const label = getAvailableActions(state, vim, { reactionTarget: null }).find((a) => a.id === id)!.label
      expect(positions.map((p) => label[p]!.toLowerCase()).join("")).toBe("le")
    }
    const plain = modeFor("")
    expect(plain.kind === "actions" && plain.labelMatches).toBeUndefined()
  })
})

import { describe, expect, test } from "bun:test"
import { paletteMode } from "./palette-mode"
import { getAvailableActions } from "../../actions"
import { createInitialState } from "../../state"
import { createCursorState } from "../../vim-diff/cursor-state"
import type { ActionSubmenu } from "../../actions/types"
import { createActionMenuState } from "./state"

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

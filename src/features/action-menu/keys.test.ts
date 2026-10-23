import { test, expect } from "bun:test"
import { parseKeypress } from "@opentui/core"
import { keymapHarness } from "../../testing/keymap-keys"
import { createInitialState, type AppState } from "../../state"
import { createCursorState } from "../../vim-diff/cursor-state"
import { getVisualActionOrder } from "../../components/action-menu-model"
import type { ActionSubmenu } from "../../actions/types"
import type { ReactionTarget } from "../../types"
import { paletteMode } from "./palette-mode"
import { registerActionMenuKeys } from "./keys"
import { createActionMenuState, type ActionMenuState } from "./state"

const vim = createCursorState()
const links = [
  { label: "#1", url: "https://example.com/1" },
  { label: "#2", url: "https://example.com/2" },
]
const target = { kind: "issue", prNumber: 1 } as const
const local = createInitialState([], [], "local", "local changes")
type Palette = (actionMenu: ActionMenuState) => void
const closed: Palette = () => {}
const open: Palette = (actionMenu) => actionMenu.show()
const inSubmenu = (submenu: ActionSubmenu): Palette => (actionMenu) => actionMenu.showSubmenu(submenu)
const onRow = (palette: Palette, row: number): Palette => (actionMenu) => {
  palette(actionMenu)
  actionMenu.move(row, Number.MAX_SAFE_INTEGER)
}

function opened(palette: Palette) {
  const actionMenu = createActionMenuState()
  palette(actionMenu)
  return actionMenu
}

async function setup(palette: Palette, state: AppState = local, reactionTarget: ReactionTarget | null = null) {
  const { riffKeymap, leftKeys, press } = await keymapHarness()
  const actionMenu = opened(palette)
  const calls: string[] = []
  registerActionMenuKeys(riffKeymap, {
    getState: () => state,
    actionMenu,
    render: () => void calls.push(actionMenu.open() ? "render open" : "render closed"),
    getVimState: () => vim,
    executeAction: (id) => void calls.push(`execute ${id}`),
    onToggleReaction: (_, rowId) => void calls.push(`reaction ${rowId}`),
    reactionTarget: () => reactionTarget,
    onLink: (action, link) => void calls.push(`link ${action} ${link.url}`),
  })
  return { palette: actionMenu, calls, leftKeys, press }
}

const visualActions = (state: AppState, reactionTarget: ReactionTarget | null = null) => {
  const mode = paletteMode(state, vim, opened(open).snapshot(), { reactionTarget })
  return mode.kind === "actions" ? getVisualActionOrder(mode.actions) : []
}

test("escape on the action list closes the palette", async () => {
  const { palette, leftKeys, press } = await setup(open)

  expect(press("\x1b").defaultPrevented).toBe(true)

  expect(palette.open()).toBe(false)
  expect(leftKeys).toEqual([])
})

test("escape in a submenu the palette opened backs out to the action list", async () => {
  const { palette, press } = await setup(inSubmenu({ kind: "react", target, title: "React", fromPalette: true }))

  press("\x1b")

  expect(palette.open()).toBe(true)
  expect(palette.submenu()).toBeNull()
})

test("escape in a submenu opened without the palette closes it", async () => {
  const { palette, press } = await setup(inSubmenu({ kind: "react", target, title: "React", fromPalette: false }))

  press("\x1b")

  expect(palette.open()).toBe(false)
})

test("enter closes the palette, then runs the selected action", async () => {
  const selected = visualActions(local)[1]!
  const { palette, calls, leftKeys, press } = await setup(onRow(open, 1))

  expect(press("\r").defaultPrevented).toBe(true)

  expect(calls).toEqual(["render closed", `execute ${selected.id}`])
  expect(palette.open()).toBe(false)
  expect(leftKeys).toEqual([])
})

test("enter on React… runs it with the palette still open, for its submenu", async () => {
  const pr: AppState = { ...local, appMode: "pr" }
  const at = visualActions(pr, target).findIndex((action) => action.id === "react")
  expect(at).toBeGreaterThanOrEqual(0)
  const { palette, calls, press } = await setup(onRow(open, at), pr, target)

  press("\r")

  expect(calls).toEqual(["execute react"])
  expect(palette.open()).toBe(true)
})

test("enter on a link row closes the palette and does what the picker was opened for", async () => {
  const { calls, press } = await setup(onRow(inSubmenu({ kind: "links", links, action: "open", title: "Links" }), 1))

  press("\r")

  expect(calls).toEqual(["render closed", "link open https://example.com/2"])
})

test("enter on a reaction row closes the palette and toggles the reaction", async () => {
  const { calls, press } = await setup(inSubmenu({ kind: "react", target, title: "React", fromPalette: false }))

  press("\r")

  expect(calls).toEqual(["render closed", "reaction react:+1"])
})

test("enter with no row to act on is still prevented and does nothing", async () => {
  const { calls, leftKeys, press } = await setup((actionMenu) => {
    actionMenu.showSubmenu({ kind: "links", links, action: "open", title: "Links" })
    actionMenu.setQuery("zzzz")
  })

  expect(press("\r").defaultPrevented).toBe(true)

  expect(calls).toEqual([])
  expect(leftKeys).toEqual([])
})

test("up, down, ctrl+p and ctrl+n move the selection and wrap round at both ends", async () => {
  const { palette, leftKeys, press } = await setup(inSubmenu({ kind: "links", links, action: "open", title: "Links" }))
  const selected = () => palette.selectedIndex()

  expect(press("\x1b[B").defaultPrevented).toBe(true)
  expect(selected()).toBe(1)
  press("\x1b[B")
  expect(selected()).toBe(0)
  expect(press("\x1b[A").defaultPrevented).toBe(true)
  expect(selected()).toBe(1)
  expect(press("\x10").defaultPrevented).toBe(true)
  expect(selected()).toBe(0)
  press("\x10")
  expect(selected()).toBe(1)
  expect(press("\x0e").defaultPrevented).toBe(true)
  expect(selected()).toBe(0)
  press("\x0e")
  expect(selected()).toBe(1)
  expect(leftKeys).toEqual([])
})

test("ctrl+shift+p and ctrl+shift+n move the selection as ctrl+p and ctrl+n do", async () => {
  const { palette, press } = await setup(inSubmenu({ kind: "links", links, action: "open", title: "Links" }))
  expect(parseKeypress("\x1b[112;6u", { useKittyKeyboard: true })).toMatchObject({ name: "p", ctrl: true, shift: true })

  press("\x1b[110;6u")
  expect(palette.selectedIndex()).toBe(1)
  press("\x1b[112;6u")
  expect(palette.selectedIndex()).toBe(0)
})

test("ctrl+y on a link row copies it, whatever the picker was opened for", async () => {
  const { calls, leftKeys, press } = await setup(inSubmenu({ kind: "links", links, action: "open", title: "Links" }))

  expect(press("\x19").defaultPrevented).toBe(true)

  expect(calls).toEqual(["render closed", "link copy https://example.com/1"])
  expect(leftKeys).toEqual([])
})

test("ctrl+y with no link to copy is neither prevented nor seen by the chain", async () => {
  const { palette, calls, leftKeys, press } = await setup(open)

  expect(press("\x19").defaultPrevented).toBe(false)

  expect(calls).toEqual([])
  expect(palette.open()).toBe(true)
  expect(leftKeys).toEqual([])
})

test("bare p, n, y, P and a letter are left for the prompt field: not prevented, not seen by the chain", async () => {
  const { palette, calls, leftKeys, press } = await setup(inSubmenu({ kind: "links", links, action: "open", title: "Links" }))

  for (const sequence of ["p", "n", "y", "P", "a"]) {
    expect(press(sequence).defaultPrevented).toBe(false)
  }

  expect(calls).toEqual([])
  expect(palette.selectedIndex()).toBe(0)
  expect(leftKeys).toEqual([])
})

test("escape and enter act with shift, ctrl or meta held", async () => {
  const parse = (sequence: string) => parseKeypress(sequence, { useKittyKeyboard: true })
  expect(parse("\x1b[27;2u")).toMatchObject({ name: "escape", shift: true })
  expect(parse("\x1b[27;5u")).toMatchObject({ name: "escape", ctrl: true })
  expect(parse("\x1b\x1b")).toMatchObject({ name: "escape", meta: true })
  expect(parse("\x1b[13;2u")).toMatchObject({ name: "return", shift: true })
  expect(parse("\x1b[13;5u")).toMatchObject({ name: "return", ctrl: true })
  expect(parse("\x1b\r")).toMatchObject({ name: "return", meta: true })

  for (const sequence of ["\x1b[27;2u", "\x1b[27;5u", "\x1b\x1b"]) {
    const { palette, leftKeys, press } = await setup(open)
    press(sequence)
    expect(palette.open()).toBe(false)
    expect(leftKeys).toEqual([])
  }
  for (const sequence of ["\x1b[13;2u", "\x1b[13;5u", "\x1b\r"]) {
    const { calls, leftKeys, press } = await setup(open)
    press(sequence)
    expect(calls).toEqual(["render closed", `execute ${visualActions(local)[0]!.id}`])
    expect(leftKeys).toEqual([])
  }
})

test("a key named enter runs the selected action as return does", async () => {
  const { calls, press } = await setup(open)

  press("\r", "enter")

  expect(calls).toEqual(["render closed", `execute ${visualActions(local)[0]!.id}`])
})

test("with the palette closed its keys reach the chain and nothing runs", async () => {
  const { calls, leftKeys, press } = await setup(closed)

  for (const sequence of ["\x1b", "\r", "\x1b[A", "\x1b[B", "\x10", "\x0e", "\x19", "p", "n", "y", "a"]) press(sequence)

  expect(calls).toEqual([])
  expect(leftKeys).toEqual(["escape", "return", "up", "down", "p", "n", "y", "p", "n", "y", "a"])
})

import { test, expect } from "bun:test"
import { parseKeypress } from "@opentui/core"
import { keymapHarness } from "../../testing/keymap-keys"
import { createInitialState, openActionMenu, openActionSubmenu, type AppState } from "../../state"
import { createCursorState } from "../../vim-diff/cursor-state"
import { getVisualActionOrder } from "../../components/action-menu-model"
import type { ActionSubmenu } from "../../actions/types"
import { paletteMode } from "./palette-mode"
import { registerActionMenuKeys } from "./keys"

const vim = createCursorState()
const links = [
  { label: "#1", url: "https://example.com/1" },
  { label: "#2", url: "https://example.com/2" },
]
const target = { kind: "issue", prNumber: 1 } as const
const closed = () => createInitialState([], [], "local", "local changes")
const open = () => openActionMenu(closed())
const inSubmenu = (submenu: ActionSubmenu) => openActionSubmenu(open(), submenu)

async function setup(initial: AppState) {
  const { riffKeymap, legacyKeys, press } = await keymapHarness()
  let state = initial
  const calls: string[] = []
  registerActionMenuKeys(riffKeymap, {
    getState: () => state,
    setState: (update) => {
      state = update(state)
      calls.push(state.actionMenu.open ? "setState open" : "setState closed")
    },
    render: () => {},
    getVimState: () => vim,
    executeAction: (id) => void calls.push(`execute ${id}`),
    onToggleReaction: (_, rowId) => void calls.push(`reaction ${rowId}`),
    onLink: (action, link) => void calls.push(`link ${action} ${link.url}`),
  })
  return { state: () => state, calls, legacyKeys, press }
}

const visualActions = (state: AppState) => {
  const mode = paletteMode(state, vim)
  return mode.kind === "actions" ? getVisualActionOrder(mode.actions) : []
}

test("escape on the action list closes the palette", async () => {
  const { state, legacyKeys, press } = await setup(open())

  expect(press("\x1b").defaultPrevented).toBe(true)

  expect(state().actionMenu.open).toBe(false)
  expect(legacyKeys).toEqual([])
})

test("escape in a submenu the palette opened backs out to the action list", async () => {
  const { state, press } = await setup(inSubmenu({ kind: "react", target, title: "React", fromPalette: true }))

  press("\x1b")

  expect(state().actionMenu.open).toBe(true)
  expect(state().actionMenu.submenu).toBeNull()
})

test("escape in a submenu opened without the palette closes it", async () => {
  const { state, press } = await setup(inSubmenu({ kind: "react", target, title: "React", fromPalette: false }))

  press("\x1b")

  expect(state().actionMenu.open).toBe(false)
})

test("enter closes the palette, then runs the selected action", async () => {
  const initial = { ...open(), actionMenu: { ...open().actionMenu, selectedIndex: 1 } }
  const selected = visualActions(initial)[1]!
  const { state, calls, legacyKeys, press } = await setup(initial)

  expect(press("\r").defaultPrevented).toBe(true)

  expect(calls).toEqual(["setState closed", `execute ${selected.id}`])
  expect(state().actionMenu.open).toBe(false)
  expect(legacyKeys).toEqual([])
})

test("enter on React… runs it with the palette still open, for its submenu", async () => {
  const pr: AppState = { ...open(), appMode: "pr", reactionTarget: target }
  const at = visualActions(pr).findIndex((action) => action.id === "react")
  expect(at).toBeGreaterThanOrEqual(0)
  const { state, calls, press } = await setup({ ...pr, actionMenu: { ...pr.actionMenu, selectedIndex: at } })

  press("\r")

  expect(calls).toEqual(["execute react"])
  expect(state().actionMenu.open).toBe(true)
})

test("enter on a link row closes the palette and does what the picker was opened for", async () => {
  const initial = inSubmenu({ kind: "links", links, action: "open", title: "Links" })
  const { calls, press } = await setup({ ...initial, actionMenu: { ...initial.actionMenu, selectedIndex: 1 } })

  press("\r")

  expect(calls).toEqual(["setState closed", "link open https://example.com/2"])
})

test("enter on a reaction row closes the palette and toggles the reaction", async () => {
  const { calls, press } = await setup(inSubmenu({ kind: "react", target, title: "React", fromPalette: false }))

  press("\r")

  expect(calls).toEqual(["setState closed", "reaction react:+1"])
})

test("enter with no row to act on is still prevented and does nothing", async () => {
  const initial = inSubmenu({ kind: "links", links, action: "open", title: "Links" })
  const { calls, legacyKeys, press } = await setup({ ...initial, actionMenu: { ...initial.actionMenu, query: "zzzz" } })

  expect(press("\r").defaultPrevented).toBe(true)

  expect(calls).toEqual([])
  expect(legacyKeys).toEqual([])
})

test("up, down, ctrl+p and ctrl+n move the selection and wrap round at both ends", async () => {
  const { state, legacyKeys, press } = await setup(inSubmenu({ kind: "links", links, action: "open", title: "Links" }))
  const selected = () => state().actionMenu.selectedIndex

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
  expect(legacyKeys).toEqual([])
})

test("ctrl+shift+p and ctrl+shift+n move the selection as ctrl+p and ctrl+n do", async () => {
  const { state, press } = await setup(inSubmenu({ kind: "links", links, action: "open", title: "Links" }))
  expect(parseKeypress("\x1b[112;6u", { useKittyKeyboard: true })).toMatchObject({ name: "p", ctrl: true, shift: true })

  press("\x1b[110;6u")
  expect(state().actionMenu.selectedIndex).toBe(1)
  press("\x1b[112;6u")
  expect(state().actionMenu.selectedIndex).toBe(0)
})

test("ctrl+y on a link row copies it, whatever the picker was opened for", async () => {
  const { calls, legacyKeys, press } = await setup(inSubmenu({ kind: "links", links, action: "open", title: "Links" }))

  expect(press("\x19").defaultPrevented).toBe(true)

  expect(calls).toEqual(["setState closed", "link copy https://example.com/1"])
  expect(legacyKeys).toEqual([])
})

test("ctrl+y with no link to copy is neither prevented nor seen by the chain", async () => {
  const { state, calls, legacyKeys, press } = await setup(open())

  expect(press("\x19").defaultPrevented).toBe(false)

  expect(calls).toEqual([])
  expect(state().actionMenu.open).toBe(true)
  expect(legacyKeys).toEqual([])
})

test("bare p, n, y, P and a letter are left for the prompt field: not prevented, not seen by the chain", async () => {
  const { state, calls, legacyKeys, press } = await setup(inSubmenu({ kind: "links", links, action: "open", title: "Links" }))

  for (const sequence of ["p", "n", "y", "P", "a"]) {
    expect(press(sequence).defaultPrevented).toBe(false)
  }

  expect(calls).toEqual([])
  expect(state().actionMenu.selectedIndex).toBe(0)
  expect(legacyKeys).toEqual([])
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
    const { state, legacyKeys, press } = await setup(open())
    press(sequence)
    expect(state().actionMenu.open).toBe(false)
    expect(legacyKeys).toEqual([])
  }
  for (const sequence of ["\x1b[13;2u", "\x1b[13;5u", "\x1b\r"]) {
    const { calls, legacyKeys, press } = await setup(open())
    press(sequence)
    expect(calls).toEqual(["setState closed", `execute ${visualActions(open())[0]!.id}`])
    expect(legacyKeys).toEqual([])
  }
})

test("a key named enter runs the selected action as return does", async () => {
  const { calls, press } = await setup(open())

  press("\r", "enter")

  expect(calls).toEqual(["setState closed", `execute ${visualActions(open())[0]!.id}`])
})

test("with the palette closed its keys reach the chain and nothing runs", async () => {
  const { calls, legacyKeys, press } = await setup(closed())

  for (const sequence of ["\x1b", "\r", "\x1b[A", "\x1b[B", "\x10", "\x0e", "\x19", "p", "n", "y", "a"]) press(sequence)

  expect(calls).toEqual([])
  expect(legacyKeys).toEqual(["escape", "return", "up", "down", "p", "n", "y", "p", "n", "y", "a"])
})

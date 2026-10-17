import { test, expect } from "bun:test"
import { createInitialState, toggleHelp, type AppState } from "../state"
import { helpViewport } from "../components/help-sections"
import { handleHelpKey } from "./help-keys"

function openHelp(height: number) {
  let state: AppState = toggleHelp(createInitialState([], [], "", ""))
  let renders = 0
  const ctx = {
    getState: () => state,
    setState: (update: (s: AppState) => AppState) => {
      state = update(state)
    },
    render: () => {
      renders++
    },
    height,
  }
  const press = (name: string, mods: { ctrl?: boolean; shift?: boolean } = {}) =>
    handleHelpKey({ name, ctrl: mods.ctrl ?? false, shift: mods.shift ?? false }, ctx)
  return { press, state: () => state, renders: () => renders }
}

test("j and k scroll the help a row at a time, and k stops at the top", () => {
  const help = openHelp(40)
  expect(help.press("j")).toBe(true)
  expect(help.state().helpScroll).toBe(1)
  expect(help.press("k")).toBe(true)
  expect(help.state().helpScroll).toBe(0)
  help.press("k")
  expect(help.state().helpScroll).toBe(0)
  help.press("down")
  help.press("up")
  help.press("down")
  expect(help.state().helpScroll).toBe(1)
  expect(help.renders()).toBe(6)
})

test("Ctrl-d jumps half the window and stops at the end; Ctrl-u comes back", () => {
  const { rows, maxScroll } = helpViewport(40)
  const help = openHelp(40)
  help.press("d", { ctrl: true })
  expect(help.state().helpScroll).toBe(Math.min(maxScroll, Math.floor(rows / 2)))
  for (let i = 0; i < 5; i++) help.press("d", { ctrl: true })
  expect(help.state().helpScroll).toBe(maxScroll)
  for (let i = 0; i < 40; i++) help.press("j")
  expect(help.state().helpScroll).toBe(maxScroll)
  help.press("k")
  expect(help.state().helpScroll).toBe(maxScroll - 1)
  for (let i = 0; i < 5; i++) help.press("u", { ctrl: true })
  expect(help.state().helpScroll).toBe(0)
})

test("where every key fits, scrolling keys leave the help where it is", () => {
  const help = openHelp(70)
  help.press("j")
  help.press("d", { ctrl: true })
  expect(help.state().helpScroll).toBe(0)
})

test("Esc closes the help, and opening it again starts at the top", () => {
  const help = openHelp(40)
  help.press("j")
  help.press("j")
  expect(help.press("escape")).toBe(true)
  expect(help.state().showHelp).toBe(false)
  expect(toggleHelp(help.state()).helpScroll).toBe(0)
})

test("every other key is swallowed, but g reaches the chord matcher for g?", () => {
  const help = openHelp(40)
  expect(help.press("x")).toBe(true)
  expect(help.press("b", { ctrl: true })).toBe(true)
  expect(help.press("g")).toBe(false)
  expect(help.state()).toMatchObject({ showHelp: true, helpScroll: 0 })
})

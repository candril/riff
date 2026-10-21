import { test, expect, afterEach } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { createInitialState, type AppState } from "../state"
import { createFlashState } from "../vim-diff/flash-state"
import { createCursorState } from "../vim-diff/cursor-state"
import type { FlashHandler } from "../vim-diff/flash-handler"
import { createRiffKeymap } from "./keymap"
import { composeKeys, type KeyHandler } from "./keys-dispatch"
import { registerModalKeys } from "./keys"

const disposers: (() => void)[] = []
afterEach(() => {
  while (disposers.length) disposers.pop()!()
})

async function setup({ flash = true, palette = false, dialog = true } = {}) {
  const rendered = await createTestRenderer({ width: 20, height: 4 })
  disposers.push(() => rendered.renderer.destroy())
  const riffKeymap = createRiffKeymap(rendered.renderer)
  const legacyKeys: string[] = []
  const legacy: KeyHandler = Object.assign((key: KeyEvent) => void legacyKeys.push(key.name), {
    chordPending: () => false,
  })
  const calls: string[] = []
  const initial = createInitialState([], [], "local", "local changes")
  let state: AppState = {
    ...initial,
    actionMenu: { ...initial.actionMenu, open: palette },
    confirmDialog: dialog
      ? {
          title: "Delete?",
          message: "Gone.",
          onConfirm: () => void calls.push("dialog yes"),
          onCancel: () => void calls.push("dialog no"),
        }
      : null,
  }
  const flashState = { ...createFlashState(), active: flash }
  const handler = {
    handleChar: (char: string) => void calls.push(`flash char ${char}`),
    handleBackspace: () => void calls.push("flash backspace"),
    cancel: () => void calls.push("flash cancel"),
  } as unknown as FlashHandler
  registerModalKeys(riffKeymap, {
    getState: () => state,
    setState: (update) => {
      state = update(state)
    },
    render: () => {},
    getVimState: () => createCursorState(),
    executeAction: (id) => void calls.push(`palette ${id}`),
    onToggleReaction: () => void calls.push("palette reaction"),
    onLink: () => void calls.push("palette link"),
    getFlashState: () => flashState,
    flashHandler: () => handler,
  })
  const keys = composeKeys(riffKeymap, legacy)
  const press = (sequence: string) =>
    keys(new KeyEvent(parseKeypress(sequence, { useKittyKeyboard: true })!))
  return { calls, legacyKeys, press, state: () => state }
}

test("with flash and the dialog both up escape cancels the flash, not the dialog", async () => {
  const { calls, legacyKeys, press } = await setup()

  press("\x1b")

  expect(calls).toEqual(["flash cancel"])
  expect(legacyKeys).toEqual([])
})

test("with flash and the dialog both up a printable key is typed into the flash, not swallowed by the dialog", async () => {
  const { calls, legacyKeys, press } = await setup()

  press("a")

  expect(calls).toEqual(["flash char a"])
  expect(legacyKeys).toEqual([])
})

test("with the palette and the dialog both up y answers the dialog and escape cancels it, leaving the palette open", async () => {
  const { calls, legacyKeys, press, state } = await setup({ flash: false, palette: true })

  press("y")
  press("\x1b")

  expect(calls).toEqual(["dialog yes", "dialog no"])
  expect(state().actionMenu.open).toBe(true)
  expect(legacyKeys).toEqual([])
})

const KITTY_SUPER_Y = "\x1b[121;9u"
const KITTY_HYPER_Y = "\x1b[121;17u"
const KITTY_SUPER_DOWN = "\x1b[1;9B"

test("with the dialog up y answers it with super or hyper held", async () => {
  expect(parseKeypress(KITTY_SUPER_Y, { useKittyKeyboard: true })).toMatchObject({ name: "y", super: true })
  expect(parseKeypress(KITTY_HYPER_Y, { useKittyKeyboard: true })).toMatchObject({ name: "y", hyper: true })
  const { calls, legacyKeys, press } = await setup({ flash: false })

  press(KITTY_SUPER_Y)
  press(KITTY_HYPER_Y)

  expect(calls).toEqual(["dialog yes", "dialog yes"])
  expect(legacyKeys).toEqual([])
})

test("with the palette open down moves its selection with super held", async () => {
  expect(parseKeypress(KITTY_SUPER_DOWN, { useKittyKeyboard: true })).toMatchObject({ name: "down", super: true })
  const { legacyKeys, press, state } = await setup({ flash: false, palette: true, dialog: false })

  press(KITTY_SUPER_DOWN)

  expect(state().actionMenu.selectedIndex).toBe(1)
  expect(legacyKeys).toEqual([])
})

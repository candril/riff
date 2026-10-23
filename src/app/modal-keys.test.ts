import { test, expect } from "bun:test"
import { parseKeypress } from "@opentui/core"
import { createInitialState } from "../state"
import { createConfirmState } from "../features/confirm/state"
import { createFlashState } from "../vim-diff/flash-state"
import { createCursorState } from "../vim-diff/cursor-state"
import type { FlashHandler } from "../vim-diff/flash-handler"
import { keymapHarness } from "../testing/keymap-keys"
import { registerQueryPickerKeys } from "./query-picker-keys"
import { registerModalKeys } from "./keys"
import { createActionMenuState } from "../features/action-menu/state"

async function setup({ flash = true, palette = false, dialog = true, picker = false } = {}) {
  const { riffKeymap, leftKeys, press } = await keymapHarness()
  const calls: string[] = []
  // Registered first, as createAppKeys registers the pickers ahead of the modals.
  registerQueryPickerKeys(riffKeymap, {
    name: "filePicker",
    category: "File picker",
    active: () => picker,
    close: () => void calls.push("picker close"),
    pick: () => void calls.push("picker pick"),
    move: (delta) => void calls.push(`picker move ${delta}`),
  })
  const state = createInitialState([], [], "local", "local changes")
  const actionMenu = createActionMenuState()
  if (palette) actionMenu.show()
  const confirm = createConfirmState()
  if (dialog) {
    confirm.show({
      title: "Delete?",
      message: "Gone.",
      onConfirm: () => void calls.push("dialog yes"),
      onCancel: () => void calls.push("dialog no"),
    })
  }
  const flashState = { ...createFlashState(), active: flash }
  const handler = {
    handleChar: (char: string) => void calls.push(`flash char ${char}`),
    handleBackspace: () => void calls.push("flash backspace"),
    cancel: () => void calls.push("flash cancel"),
  } as unknown as FlashHandler
  registerModalKeys(riffKeymap, {
    getState: () => state,
    actionMenu,
    render: () => {},
    getVimState: () => createCursorState(),
    executeAction: (id) => void calls.push(`palette ${id}`),
    onToggleReaction: () => void calls.push("palette reaction"),
    reactionTarget: () => null,
    onLink: () => void calls.push("palette link"),
    getFlashState: () => flashState,
    flashHandler: () => handler,
    confirm,
  })
  return { calls, leftKeys, press, actionMenu }
}

test("with flash and the dialog both up escape cancels the flash, not the dialog", async () => {
  const { calls, leftKeys, press } = await setup()

  press("\x1b")

  expect(calls).toEqual(["flash cancel"])
  expect(leftKeys).toEqual([])
})

test("with flash and the dialog both up a printable key is typed into the flash, not swallowed by the dialog", async () => {
  const { calls, leftKeys, press } = await setup()

  press("a")

  expect(calls).toEqual(["flash char a"])
  expect(leftKeys).toEqual([])
})

test("with the palette and the dialog both up y answers the dialog and escape cancels it, leaving the palette open", async () => {
  const { calls, leftKeys, press, actionMenu } = await setup({ flash: false, palette: true })

  press("y")
  press("\x1b")

  expect(calls).toEqual(["dialog yes", "dialog no"])
  expect(actionMenu.open()).toBe(true)
  expect(leftKeys).toEqual([])
})

const KITTY_SUPER_Y = "\x1b[121;9u"
const KITTY_HYPER_Y = "\x1b[121;17u"
const KITTY_SUPER_DOWN = "\x1b[1;9B"

test("with the dialog up y answers it with super or hyper held", async () => {
  expect(parseKeypress(KITTY_SUPER_Y, { useKittyKeyboard: true })).toMatchObject({ name: "y", super: true })
  expect(parseKeypress(KITTY_HYPER_Y, { useKittyKeyboard: true })).toMatchObject({ name: "y", hyper: true })
  const { calls, leftKeys, press } = await setup({ flash: false })

  press(KITTY_SUPER_Y)
  press(KITTY_HYPER_Y)

  expect(calls).toEqual(["dialog yes", "dialog yes"])
  expect(leftKeys).toEqual([])
})

test("with the palette open down moves its selection with super held", async () => {
  expect(parseKeypress(KITTY_SUPER_DOWN, { useKittyKeyboard: true })).toMatchObject({ name: "down", super: true })
  const { leftKeys, press, actionMenu } = await setup({ flash: false, palette: true, dialog: false })

  press(KITTY_SUPER_DOWN)

  expect(actionMenu.selectedIndex()).toBe(1)
  expect(leftKeys).toEqual([])
})

test("with the palette and the dialog both up down and ctrl+n leave the palette's selection alone, and ctrl+n cancels the dialog", async () => {
  const { calls, leftKeys, press, actionMenu } = await setup({ flash: false, palette: true })

  press("\x1b[B")
  press("\x0e")
  press("y")

  expect(actionMenu.selectedIndex()).toBe(0)
  expect(calls).toEqual(["dialog no", "dialog yes"])
  expect(leftKeys).toEqual([])
})

test("with flash and the dialog both up y and n are typed into the flash, not answered", async () => {
  const { calls, leftKeys, press } = await setup()

  press("y")
  press("n")
  press("\x1b")

  expect(calls).toEqual(["flash char y", "flash char n", "flash cancel"])
  expect(leftKeys).toEqual([])
})

test("with a picker and the dialog both up the picker's enter and up do not run", async () => {
  const { calls, leftKeys, press } = await setup({ flash: false, picker: true })

  press("\r")
  press("\x1b[A")
  press("n")

  expect(calls).toEqual(["dialog no"])
  expect(leftKeys).toEqual([])
})

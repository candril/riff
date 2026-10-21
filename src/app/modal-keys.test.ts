import { test, expect, afterEach } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { createInitialState, type AppState } from "../state"
import { createFlashState } from "../vim-diff/flash-state"
import type { FlashHandler } from "../vim-diff/flash-handler"
import { createRiffKeymap } from "./keymap"
import { composeKeys, type KeyHandler } from "./keys-dispatch"
import { registerModalKeys } from "./keys"

const disposers: (() => void)[] = []
afterEach(() => {
  while (disposers.length) disposers.pop()!()
})

async function setup() {
  const rendered = await createTestRenderer({ width: 20, height: 4 })
  disposers.push(() => rendered.renderer.destroy())
  const riffKeymap = createRiffKeymap(rendered.renderer)
  const legacyKeys: string[] = []
  const legacy: KeyHandler = Object.assign((key: KeyEvent) => void legacyKeys.push(key.name), {
    chordPending: () => false,
  })
  const calls: string[] = []
  const state: AppState = {
    ...createInitialState([], [], "local", "local changes"),
    confirmDialog: {
      title: "Delete?",
      message: "Gone.",
      onConfirm: () => void calls.push("dialog yes"),
      onCancel: () => void calls.push("dialog no"),
    },
  }
  const flashState = { ...createFlashState(), active: true }
  const handler = {
    handleChar: (char: string) => void calls.push(`flash char ${char}`),
    handleBackspace: () => void calls.push("flash backspace"),
    cancel: () => void calls.push("flash cancel"),
  } as unknown as FlashHandler
  registerModalKeys(riffKeymap, {
    getState: () => state,
    getFlashState: () => flashState,
    flashHandler: () => handler,
  })
  const keys = composeKeys(riffKeymap, legacy)
  const press = (sequence: string) => keys(new KeyEvent(parseKeypress(sequence)!))
  return { calls, legacyKeys, press }
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

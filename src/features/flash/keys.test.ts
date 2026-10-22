import { test, expect } from "bun:test"
import { parseKeypress } from "@opentui/core"
import { keymapHarness } from "../../testing/keymap-keys"
import { createFlashState } from "../../vim-diff/flash-state"
import type { FlashHandler } from "../../vim-diff/flash-handler"
import { registerFlashKeys } from "./keys"

async function setup() {
  const { riffKeymap, legacyKeys, press } = await keymapHarness()
  const flashState = createFlashState()
  const calls: string[] = []
  const handler = {
    handleChar: (char: string) => void calls.push(`char ${char}`),
    handleBackspace: () => void calls.push("backspace"),
    cancel: () => void calls.push("cancel"),
  } as unknown as FlashHandler
  registerFlashKeys(riffKeymap, { getFlashState: () => flashState, flashHandler: () => handler })
  return { flashState, calls, legacyKeys, press }
}

test("while flash is active a printable key, shifted or not, is typed into the jump", async () => {
  const { flashState, calls, legacyKeys, press } = await setup()
  flashState.active = true

  press("a")
  press("A")

  expect(calls).toEqual(["char a", "char A"])
  expect(legacyKeys).toEqual([])
})

test("while flash is active backspace takes back a character and escape, return and ctrl+c cancel", async () => {
  const { flashState, calls, legacyKeys, press } = await setup()
  flashState.active = true

  press("\x7f")
  press("\x1b")
  press("\r")
  press("\x03")

  expect(calls).toEqual(["backspace", "cancel", "cancel", "cancel"])
  expect(legacyKeys).toEqual([])
})

test("while flash is active modified escape, ctrl+c, return and backspace still cancel or take back", async () => {
  const { flashState, calls, legacyKeys, press } = await setup()
  flashState.active = true
  const parse = (sequence: string) => parseKeypress(sequence, { useKittyKeyboard: true })
  expect(parse("\x1b\x1b")).toMatchObject({ name: "escape", ctrl: false, shift: false, meta: true })
  expect(parse("\x1b[99;6u")).toMatchObject({ name: "c", ctrl: true, shift: true, meta: false })
  expect(parse("\x1b\x7f")).toMatchObject({ name: "backspace", ctrl: false, shift: false, meta: true })
  expect(parse("\x1b[127;5u")).toMatchObject({ name: "backspace", ctrl: true, shift: false, meta: false })
  expect(parse("\x1b\r")).toMatchObject({ name: "return", ctrl: false, shift: false, meta: true })
  expect(parse("\x1b[13;5u")).toMatchObject({ name: "return", ctrl: true, shift: false, meta: false })

  press("\x1b\x1b")
  press("\x1b[99;6u")
  press("\x1b\x7f")
  press("\x1b[127;5u")
  press("\x1b\r")
  press("\x1b[13;5u")

  expect(calls).toEqual(["cancel", "cancel", "backspace", "backspace", "cancel", "cancel"])
  expect(legacyKeys).toEqual([])
})

test("while flash is active a key named enter cancels as return does", async () => {
  const { flashState, calls, legacyKeys, press } = await setup()
  flashState.active = true

  press("\r", "enter")

  expect(calls).toEqual(["cancel"])
  expect(legacyKeys).toEqual([])
})

test("while flash is active a control key that is not bound is swallowed", async () => {
  const { flashState, calls, legacyKeys, press } = await setup()
  flashState.active = true

  press("\x18")

  expect(calls).toEqual([])
  expect(legacyKeys).toEqual([])
})

test("while flash is inactive its keys reach the chain and the handler sees nothing", async () => {
  const { calls, legacyKeys, press } = await setup()

  press("s")
  press("\x1b")
  press("\x7f")

  expect(calls).toEqual([])
  expect(legacyKeys).toEqual(["s", "escape", "backspace"])
})

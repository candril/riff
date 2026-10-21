import { test, expect, afterEach } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { createRiffKeymap } from "../../app/keymap"
import { composeKeys, type KeyHandler } from "../../app/keys-dispatch"
import { createFlashState } from "../../vim-diff/flash-state"
import type { FlashHandler } from "../../vim-diff/flash-handler"
import { registerFlashKeys } from "./keys"

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
  const flashState = createFlashState()
  const calls: string[] = []
  const handler = {
    handleChar: (char: string) => void calls.push(`char ${char}`),
    handleBackspace: () => void calls.push("backspace"),
    cancel: () => void calls.push("cancel"),
  } as unknown as FlashHandler
  registerFlashKeys(riffKeymap, { getFlashState: () => flashState, flashHandler: () => handler })
  const keys = composeKeys(riffKeymap, legacy)
  const press = (sequence: string) => keys(new KeyEvent(parseKeypress(sequence, { useKittyKeyboard: true })!))
  return { flashState, calls, legacyKeys, keys, press }
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
  const { flashState, calls, legacyKeys, keys } = await setup()
  flashState.active = true

  keys(new KeyEvent({ ...parseKeypress("\r")!, name: "enter" }))

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

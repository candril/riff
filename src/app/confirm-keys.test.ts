import { test, expect, afterEach } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { createInitialState, type AppState } from "../state"
import { createRiffKeymap } from "./keymap"
import { composeKeys, type KeyHandler } from "./keys-dispatch"
import { registerConfirmKeys } from "./confirm-keys"

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
  const answers: string[] = []
  let state: AppState = {
    ...createInitialState([], [], "local", "local changes"),
    confirmDialog: {
      title: "Delete?",
      message: "Gone.",
      onConfirm: () => void answers.push("yes"),
      onCancel: () => void answers.push("no"),
    },
  }
  registerConfirmKeys(riffKeymap, { getState: () => state })
  const keys = composeKeys(riffKeymap, legacy)
  const press = (sequence: string) => keys(new KeyEvent(parseKeypress(sequence)!))
  const close = () => void (state = { ...state, confirmDialog: null })
  return { answers, legacyKeys, press, close }
}

test("y and Y confirm", async () => {
  const { answers, legacyKeys, press } = await setup()

  press("y")
  press("Y")

  expect(answers).toEqual(["yes", "yes"])
  expect(legacyKeys).toEqual([])
})

test("n, N and escape cancel", async () => {
  const { answers, legacyKeys, press } = await setup()

  press("n")
  press("N")
  press("\x1b")

  expect(answers).toEqual(["no", "no", "no"])
  expect(legacyKeys).toEqual([])
})

test("ctrl+y and alt+y confirm", async () => {
  const { answers, legacyKeys, press } = await setup()
  expect(parseKeypress("\x19")).toMatchObject({ name: "y", ctrl: true, meta: false })
  expect(parseKeypress("\x1by")).toMatchObject({ name: "y", ctrl: false, meta: true })

  press("\x19")
  press("\x1by")

  expect(answers).toEqual(["yes", "yes"])
  expect(legacyKeys).toEqual([])
})

test("ctrl+n, alt+n and alt+escape cancel", async () => {
  const { answers, legacyKeys, press } = await setup()
  expect(parseKeypress("\x0e")).toMatchObject({ name: "n", ctrl: true, meta: false })
  expect(parseKeypress("\x1bn")).toMatchObject({ name: "n", ctrl: false, meta: true })
  expect(parseKeypress("\x1b\x1b")).toMatchObject({ name: "escape", ctrl: false, meta: true })

  press("\x0e")
  press("\x1bn")
  press("\x1b\x1b")

  expect(answers).toEqual(["no", "no", "no"])
  expect(legacyKeys).toEqual([])
})

test("any other key reaches neither the answer nor the chain", async () => {
  const { answers, legacyKeys, press } = await setup()

  press("j")
  press("c")

  expect(answers).toEqual([])
  expect(legacyKeys).toEqual([])
})

test("with no dialog up y reaches the chain", async () => {
  const { answers, legacyKeys, press, close } = await setup()
  close()

  press("y")

  expect(answers).toEqual([])
  expect(legacyKeys).toEqual(["y"])
})

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
  const test = await createTestRenderer({ width: 20, height: 4 })
  disposers.push(() => test.renderer.destroy())
  const riffKeymap = createRiffKeymap(test.renderer)
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

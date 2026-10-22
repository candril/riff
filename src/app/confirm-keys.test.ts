import { test, expect } from "bun:test"
import { parseKeypress } from "@opentui/core"
import { createInitialState, type AppState } from "../state"
import { keymapHarness } from "../testing/keymap-keys"
import { registerConfirmKeys } from "./confirm-keys"

async function setup() {
  const { riffKeymap, leftKeys, press } = await keymapHarness()
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
  const close = () => void (state = { ...state, confirmDialog: null })
  return { answers, leftKeys, press, close }
}

test("y and Y confirm", async () => {
  const { answers, leftKeys, press } = await setup()

  press("y")
  press("Y")

  expect(answers).toEqual(["yes", "yes"])
  expect(leftKeys).toEqual([])
})

test("n, N and escape cancel", async () => {
  const { answers, leftKeys, press } = await setup()

  press("n")
  press("N")
  press("\x1b")

  expect(answers).toEqual(["no", "no", "no"])
  expect(leftKeys).toEqual([])
})

test("ctrl+y and alt+y confirm", async () => {
  const { answers, leftKeys, press } = await setup()
  expect(parseKeypress("\x19")).toMatchObject({ name: "y", ctrl: true, meta: false })
  expect(parseKeypress("\x1by")).toMatchObject({ name: "y", ctrl: false, meta: true })

  press("\x19")
  press("\x1by")

  expect(answers).toEqual(["yes", "yes"])
  expect(leftKeys).toEqual([])
})

test("ctrl+n, alt+n and alt+escape cancel", async () => {
  const { answers, leftKeys, press } = await setup()
  expect(parseKeypress("\x0e")).toMatchObject({ name: "n", ctrl: true, meta: false })
  expect(parseKeypress("\x1bn")).toMatchObject({ name: "n", ctrl: false, meta: true })
  expect(parseKeypress("\x1b\x1b")).toMatchObject({ name: "escape", ctrl: false, meta: true })

  press("\x0e")
  press("\x1bn")
  press("\x1b\x1b")

  expect(answers).toEqual(["no", "no", "no"])
  expect(leftKeys).toEqual([])
})

test("any other key reaches neither the answer nor the chain", async () => {
  const { answers, leftKeys, press } = await setup()

  press("j")
  press("c")

  expect(answers).toEqual([])
  expect(leftKeys).toEqual([])
})

test("with no dialog up y reaches the chain", async () => {
  const { answers, leftKeys, press, close } = await setup()
  close()

  press("y")

  expect(answers).toEqual([])
  expect(leftKeys).toEqual(["y"])
})

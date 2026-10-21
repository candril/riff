import { test, expect, afterEach } from "bun:test"
import { KeyEvent } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { createRiffKeymap } from "./keymap"
import { composeKeys, type KeyHandler } from "./keys-dispatch"
import { registerAppKeys } from "./app-keys"

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
  const keys = composeKeys(riffKeymap, legacy)
  return { ...test, riffKeymap, legacyKeys, keys }
}

function press(name: string) {
  return new KeyEvent({
    name,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    sequence: name,
    number: false,
    raw: name,
    eventType: "press",
    source: "raw",
  })
}

test("a key bound in a global layer runs its command and never reaches the chain", async () => {
  const { riffKeymap, legacyKeys, keys } = await setup()
  const runs: string[] = []
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.x", run: () => void runs.push("x") }],
    bindings: [{ key: "x", cmd: "test.x" }],
  })

  expect(riffKeymap.offer(press("x"))).toBe(true)
  keys(press("x"))

  expect(runs).toEqual(["x", "x"])
  expect(legacyKeys).toEqual([])
})

test("an unbound key reaches the chain exactly once", async () => {
  const { riffKeymap, legacyKeys, keys } = await setup()
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.x", run: () => {} }],
    bindings: [{ key: "x", cmd: "test.x" }],
  })

  expect(riffKeymap.offer(press("j"))).toBe(false)
  keys(press("j"))

  expect(legacyKeys).toEqual(["j"])
})

test("the first key of a sequence is a pending chord the chain never sees", async () => {
  const { riffKeymap, legacyKeys, keys } = await setup()
  const runs: string[] = []
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.gx", run: () => void runs.push("gx") }],
    bindings: [{ key: "gx", cmd: "test.gx" }],
  })

  keys(press("g"))
  expect(keys.chordPending()).toBe(true)
  expect(legacyKeys).toEqual([])

  keys(press("x"))
  expect(runs).toEqual(["gx"])
  expect(keys.chordPending()).toBe(false)
  expect(legacyKeys).toEqual([])
})

test("a key that breaks off a sequence goes to the chain", async () => {
  const { riffKeymap, legacyKeys, keys } = await setup()
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.gx", run: () => {} }],
    bindings: [{ key: "gx", cmd: "test.gx" }],
  })

  keys(press("g"))
  keys(press("j"))

  expect(keys.chordPending()).toBe(false)
  expect(legacyKeys).toEqual(["j"])
})

test("the renderer's own keypress stream does not feed the keymap", async () => {
  const { renderer, mockInput, riffKeymap } = await setup()
  const runs: string[] = []
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.x", run: () => void runs.push("x") }],
    bindings: [{ key: "x", cmd: "test.x" }],
  })
  const seen: string[] = []
  renderer.keyInput.on("keypress", (key: KeyEvent) => void seen.push(key.name))

  mockInput.pressKey("x")

  expect(seen).toEqual(["x"])
  expect(runs).toEqual([])
})

test("F12 toggles the debug console through the app layer", async () => {
  const { riffKeymap, legacyKeys, keys } = await setup()
  let toggles = 0
  registerAppKeys(riffKeymap.keymap, { toggleConsole: () => void toggles++ })

  keys(press("f12"))

  expect(toggles).toBe(1)
  expect(legacyKeys).toEqual([])
  const entry = riffKeymap.keymap
    .getCommandEntries({ visibility: "registered" })
    .find((e) => e.command.name === "app.console")
  expect(entry?.command["title"]).toBe("Toggle the debug console")
  expect(entry?.command["category"]).toBe("Debug")
  expect(entry?.bindings.map((b) => b.sequence.map((p) => p.display).join(" "))).toEqual(["f12"])
})

test("F12 as the terminal sends it reaches the app layer through riff's one keypress listener", async () => {
  const { renderer, mockInput, riffKeymap, legacyKeys, keys } = await setup()
  let toggles = 0
  registerAppKeys(riffKeymap.keymap, { toggleConsole: () => void toggles++ })
  renderer.keyInput.on("keypress", keys)

  mockInput.pressKey("F12")
  mockInput.pressKey("j")

  expect(toggles).toBe(1)
  expect(legacyKeys).toEqual(["j"])
})

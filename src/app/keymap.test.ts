import { test, expect, afterEach } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { createRiffKeymap } from "./keymap"
import { composeKeys, type LeftoverKeys } from "./keys-dispatch"
import { registerAppKeys } from "./app-keys"

const disposers: (() => void)[] = []
afterEach(() => {
  while (disposers.length) disposers.pop()!()
})

async function setup() {
  const rendered = await createTestRenderer({ width: 20, height: 4 })
  disposers.push(() => rendered.renderer.destroy())
  const riffKeymap = createRiffKeymap(rendered.renderer)
  const leftKeys: string[] = []
  const leftover: LeftoverKeys = (key: KeyEvent) => void leftKeys.push(key.name)
  const keys = composeKeys(riffKeymap, leftover)
  return { ...rendered, riffKeymap, leftKeys, keys }
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
  const { riffKeymap, leftKeys, keys } = await setup()
  const runs: string[] = []
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.x", run: () => void runs.push("x") }],
    bindings: [{ key: "x", cmd: "test.x" }],
  })

  expect(riffKeymap.offer(press("x"))).toBe(true)
  keys(press("x"))

  expect(runs).toEqual(["x", "x"])
  expect(leftKeys).toEqual([])
})

test("an unbound key reaches the chain exactly once", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.x", run: () => {} }],
    bindings: [{ key: "x", cmd: "test.x" }],
  })

  expect(riffKeymap.offer(press("j"))).toBe(false)
  keys(press("j"))

  expect(leftKeys).toEqual(["j"])
})

test("the first key of a sequence is a pending chord the chain never sees", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  const runs: string[] = []
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.gx", run: () => void runs.push("gx") }],
    bindings: [{ key: "gx", cmd: "test.gx" }],
  })

  keys(press("g"))
  expect(keys.chordPending()).toBe(true)
  expect(leftKeys).toEqual([])

  keys(press("x"))
  expect(runs).toEqual(["gx"])
  expect(keys.chordPending()).toBe(false)
  expect(leftKeys).toEqual([])
})

test("a key that breaks off a sequence goes to the chain", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.gx", run: () => {} }],
    bindings: [{ key: "gx", cmd: "test.gx" }],
  })

  keys(press("g"))
  keys(press("j"))

  expect(keys.chordPending()).toBe(false)
  expect(leftKeys).toEqual(["j"])
})

test("reoffering holds only while a key that broke off a sequence goes round the layers again, and is safe in enabled", async () => {
  const { riffKeymap, keys } = await setup()
  const seen: boolean[] = []
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.gx", run: () => {} }],
    bindings: [{ key: "gx", cmd: "test.gx" }],
  })
  riffKeymap.keymap.registerLayer({
    enabled: () => {
      seen.push(riffKeymap.reoffering())
      return true
    },
    commands: [{ name: "test.j", run: () => false }],
    bindings: [{ key: "j", cmd: "test.j" }],
  })

  keys(press("j"))
  expect(seen.length).toBeGreaterThan(0)
  expect(seen.every((reoffered) => !reoffered)).toBe(true)

  seen.length = 0
  keys(press("g"))
  keys(press("j"))
  expect(seen).toContain(true)
  expect(riffKeymap.reoffering()).toBe(false)
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
  const { riffKeymap, leftKeys, keys } = await setup()
  let toggles = 0
  registerAppKeys(riffKeymap.keymap, { toggleConsole: () => void toggles++ })

  keys(press("f12"))

  expect(toggles).toBe(1)
  expect(leftKeys).toEqual([])
  const entry = riffKeymap.keymap
    .getCommandEntries({ visibility: "registered" })
    .find((e) => e.command.name === "app.console")
  expect(entry?.command["title"]).toBe("Toggle the debug console")
  expect(entry?.command["category"]).toBe("Debug")
  expect(entry?.bindings.map((b) => b.sequence.map((p) => p.display).join(" "))).toContain("f12")
})

test("F12 as the terminal sends it reaches the app layer through riff's one keypress listener", async () => {
  const { renderer, mockInput, riffKeymap, leftKeys, keys } = await setup()
  let toggles = 0
  registerAppKeys(riffKeymap.keymap, { toggleConsole: () => void toggles++ })
  renderer.keyInput.on("keypress", keys)

  mockInput.pressKey("F12")
  mockInput.pressKey("j")

  expect(toggles).toBe(1)
  expect(leftKeys).toEqual(["j"])
})

test("F12 with shift or ctrl held still toggles the debug console", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  let toggles = 0
  registerAppKeys(riffKeymap.keymap, { toggleConsole: () => void toggles++ })
  expect(parseKeypress("\x1b[24;2~")).toMatchObject({ name: "f12", shift: true, ctrl: false })
  expect(parseKeypress("\x1b[24;5~")).toMatchObject({ name: "f12", shift: false, ctrl: true })

  keys(new KeyEvent(parseKeypress("\x1b[24;2~")!))
  keys(new KeyEvent(parseKeypress("\x1b[24;5~")!))

  expect(toggles).toBe(2)
  expect(leftKeys).toEqual([])
})

test("F12 with super held still toggles the debug console", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  let toggles = 0
  registerAppKeys(riffKeymap.keymap, { toggleConsole: () => void toggles++ })
  const superF12 = parseKeypress("\x1b[24;9~", { useKittyKeyboard: true })!
  expect(superF12).toMatchObject({ name: "f12", super: true })

  keys(new KeyEvent(superF12))

  expect(toggles).toBe(1)
  expect(leftKeys).toEqual([])
})

test("of two layers binding a key the later registered runs, and of two active captures the later takes the rest", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  const runs: string[] = []
  for (const name of ["earlier", "later"]) {
    riffKeymap.keymap.registerLayer({
      commands: [{ name, run: () => void runs.push(name) }],
      bindings: [{ key: "x", cmd: name }],
    })
    riffKeymap.capture(() => true, () => void runs.push(`${name} rest`))
  }

  keys(press("x"))
  keys(press("j"))

  expect(runs).toEqual(["later", "later rest"])
  expect(leftKeys).toEqual([])
})

test("while a capture is active an unbound key goes to its rest and never reaches the chain", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  const rest: string[] = []
  riffKeymap.capture(() => true, (key) => void rest.push(key.name))

  keys(press("j"))

  expect(rest).toEqual(["j"])
  expect(leftKeys).toEqual([])
})

test("while a capture is inactive a key reaches the chain exactly once and its rest sees nothing", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  const rest: string[] = []
  riffKeymap.capture(() => false, (key) => void rest.push(key.name))

  keys(press("j"))

  expect(rest).toEqual([])
  expect(leftKeys).toEqual(["j"])
})

test("a capture that turns down one key lets that key reach the chain and keeps the others", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  const rest: string[] = []
  riffKeymap.capture((key) => key.name !== "g", (key) => void rest.push(key.name))

  keys(press("j"))
  keys(press("g"))
  keys(press("k"))

  expect(rest).toEqual(["j", "k"])
  expect(leftKeys).toEqual(["g"])
})

test("a layer enabled by its capture's hold stands aside under a later active capture, even for a key that one leaves unbound", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  const runs: string[] = []
  let upper = false
  const lower = riffKeymap.capture(() => true)
  riffKeymap.keymap.registerLayer({
    enabled: () => lower.holds(),
    commands: [{ name: "test.j", run: () => void runs.push("j") }],
    bindings: [{ key: "j", cmd: "test.j" }],
  })
  riffKeymap.capture(() => upper)

  keys(press("j"))
  upper = true
  keys(press("j"))

  expect(runs).toEqual(["j"])
  expect(leftKeys).toEqual([])
  expect(lower.holds()).toBe(false)
})

test("held() is true only while an active capture holds the key being offered", async () => {
  const { riffKeymap, keys } = await setup()
  const seen: boolean[] = []
  let active = false
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.j", run: () => void seen.push(riffKeymap.held()) }],
    bindings: [{ key: "j", cmd: "test.j" }],
  })
  riffKeymap.capture(() => active)

  keys(press("j"))
  active = true
  keys(press("j"))

  expect(seen).toEqual([false, true])
  expect(riffKeymap.held()).toBe(false)
})

test("a key bound in a layer enabled with the capture runs its command, not the capture's rest", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  const active = () => true
  const runs: string[] = []
  const rest: string[] = []
  riffKeymap.keymap.registerLayer({
    enabled: active,
    commands: [{ name: "test.x", run: () => void runs.push("x") }],
    bindings: [{ key: "x", cmd: "test.x" }],
  })
  riffKeymap.capture(active, (key) => void rest.push(key.name))

  keys(press("x"))

  expect(runs).toEqual(["x"])
  expect(rest).toEqual([])
  expect(leftKeys).toEqual([])
})

test("a binding that ends the capture as it runs still keeps its key from the chain", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  let open = true
  const rest: string[] = []
  riffKeymap.keymap.registerLayer({
    enabled: () => open,
    commands: [{ name: "test.close", run: () => void (open = false) }],
    bindings: [{ key: "escape", cmd: "test.close" }],
  })
  riffKeymap.capture(() => open, (key) => void rest.push(key.name))

  keys(press("escape"))
  expect(open).toBe(false)
  expect(leftKeys).toEqual([])

  keys(press("escape"))
  expect(leftKeys).toEqual(["escape"])
  expect(rest).toEqual([])
})

test("an unregistered capture lets keys through again", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  const rest: string[] = []
  const unregister = riffKeymap.capture(() => true, (key) => void rest.push(key.name))

  keys(press("j"))
  unregister()
  keys(press("k"))

  expect(rest).toEqual(["j"])
  expect(leftKeys).toEqual(["k"])
})

test("a disabled command leaves its key to a lower layer's binding, and with none there to the capture's rest unprevented", async () => {
  const { riffKeymap, leftKeys, keys } = await setup()
  const runs: string[] = []
  const rest: string[] = []
  riffKeymap.capture(() => true, (key) => void rest.push(key.name))
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.lower", run: () => void runs.push("lower") }],
    bindings: [{ key: "x", cmd: "test.lower" }],
  })
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.upper", enabled: () => false, run: () => void runs.push("upper") }],
    bindings: [
      { key: "x", cmd: "test.upper" },
      { key: "y", cmd: "test.upper" },
    ],
  })

  keys(press("x"))
  const y = press("y")
  keys(y)

  expect(runs).toEqual(["lower"])
  expect(rest).toEqual(["y"])
  expect(y.defaultPrevented).toBe(false)
  expect(leftKeys).toEqual([])
})

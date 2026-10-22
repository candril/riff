import { expect, test } from "bun:test"
import { keymapHarness } from "../testing/keymap-keys"

async function bracketF() {
  const harness = await keymapHarness()
  const runs: string[] = []
  harness.riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.f", run: () => void runs.push("]f") }],
    bindings: [{ key: "]f", cmd: "test.f" }],
  })
  return { ...harness, runs }
}

test("a layer binding Ctrl-r takes the key that broke off a pending sequence", async () => {
  const { riffKeymap, press, runs, legacyKeys, chordPending } = await bracketF()
  const reached: boolean[] = []
  riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.chat", run: () => void reached.push(riffKeymap.chordPending()) }],
    bindings: [{ key: "ctrl+r", cmd: "test.chat" }],
  })

  press("]")
  press("\x12")

  expect(reached).toEqual([true])
  expect(runs).toEqual([])
  expect(legacyKeys).toEqual([])
  expect(chordPending()).toBe(false)
})

test("a layer that gives way to a chord declines that key, which reaches the chain as a chord's second key", async () => {
  const { riffKeymap, press, legacyKeys, brokenKeys, chordPending } = await bracketF()
  const runs: string[] = []
  // Declining in run, as the global layer does: an `enabled` that asks the
  // keymap for its pending sequence recurses into the keymap's own check.
  riffKeymap.keymap.registerLayer({
    commands: [
      {
        name: "test.q",
        run: () => {
          if (riffKeymap.chordPending()) return false
          runs.push("q")
        },
      },
    ],
    bindings: [{ key: "q", cmd: "test.q" }],
  })

  press("]")
  press("q")

  expect(runs).toEqual([])
  expect(legacyKeys).toEqual(["q"])
  expect(brokenKeys).toEqual(["q"])
  expect(chordPending()).toBe(false)
})

test("a key nothing takes reaches the chain once, as a chord's second key", async () => {
  const { press, legacyKeys, brokenKeys, chordPending } = await bracketF()

  press("]")
  press("x")

  expect(legacyKeys).toEqual(["x"])
  expect(brokenKeys).toEqual(["x"])
  expect(chordPending()).toBe(false)
})

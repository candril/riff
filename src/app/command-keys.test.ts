import { expect, onTestFinished, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { createRiffKeymap } from "./keymap"
import { commandKeys } from "./command-keys"

async function bareKeymap() {
  const { renderer } = await createTestRenderer({ width: 20, height: 4 })
  onTestFinished(() => renderer.destroy())
  return createRiffKeymap(renderer).keymap
}

test("reads each registered command's keys across layers, and skips a command without them", async () => {
  const keymap = await bareKeymap()
  keymap.registerLayer({
    commands: [
      { name: "a.next", keys: "]f", run: () => true },
      { name: "a.plain", run: () => true },
    ],
    bindings: [{ key: "n", cmd: "a.next" }],
  })
  // A layer that is never enabled still registers its commands.
  keymap.registerLayer({
    enabled: () => false,
    commands: [{ name: "b.wrap", keys: "zw", run: () => true }],
    bindings: [],
  })

  expect([...commandKeys(keymap)]).toEqual([
    ["a.next", "]f"],
    ["b.wrap", "zw"],
  ])
})

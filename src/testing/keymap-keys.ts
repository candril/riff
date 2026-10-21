import { afterEach } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { createRiffKeymap } from "../app/keymap"
import { composeKeys, type KeyHandler } from "../app/keys-dispatch"

const disposers: (() => void)[] = []
afterEach(() => {
  while (disposers.length) disposers.pop()!()
})

/**
 * A real keymap in front of a chain that only records the names it is
 * handed. `press` takes a terminal sequence, or a key the parser cannot
 * produce (`name: "enter"`) spelled out over one it can.
 */
export async function keymapHarness() {
  const rendered = await createTestRenderer({ width: 20, height: 4 })
  disposers.push(() => rendered.renderer.destroy())
  const riffKeymap = createRiffKeymap(rendered.renderer)
  const legacyKeys: string[] = []
  const legacy: KeyHandler = Object.assign((key: KeyEvent) => void legacyKeys.push(key.name), {
    chordPending: () => false,
  })
  const keys = composeKeys(riffKeymap, legacy)
  const press = (sequence: string, rename?: string) => {
    const parsed = parseKeypress(sequence, { useKittyKeyboard: true })!
    const key = new KeyEvent(rename ? { ...parsed, name: rename } : parsed)
    keys(key)
    return key
  }
  return { riffKeymap, legacyKeys, press }
}

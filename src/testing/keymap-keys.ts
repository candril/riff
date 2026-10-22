import { onTestFinished } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { createRiffKeymap } from "../app/keymap"
import { composeKeys, type LeftoverKeys } from "../app/keys-dispatch"

export interface KeymapHarnessOptions {
  /** What the dispatch entry runs ahead of every layer, as createAppKeys hands it the mark layer's settle. */
  settle?: (key: KeyEvent) => void
}

/**
 * A real keymap in front of a leftover that only records the names it is
 * handed. `press` takes a terminal sequence, or a key the parser cannot
 * produce (`name: "enter"`) spelled out over one it can. Call it inside a
 * test.
 */
export async function keymapHarness({ settle }: KeymapHarnessOptions = {}) {
  const rendered = await createTestRenderer({ width: 20, height: 4 })
  // Not a module-level afterEach: bun runs every test file in one process
  // and loads this module once, so such a hook would only ever clean up
  // after the first file that imports it, and each renderer left behind
  // keeps a listener on OpenTUI's process-wide console cache.
  onTestFinished(() => rendered.renderer.destroy())
  const riffKeymap = createRiffKeymap(rendered.renderer)
  const leftKeys: string[] = []
  // The keys the leftover was handed as the second key of a chord the keymap held.
  const brokenKeys: string[] = []
  const leftover: LeftoverKeys = (key: KeyEvent, chordBroken?: boolean) => {
    leftKeys.push(key.name)
    if (chordBroken) brokenKeys.push(key.name)
  }
  const keys = composeKeys(riffKeymap, leftover, settle)
  const press = (sequence: string, rename?: string) => {
    const parsed = parseKeypress(sequence, { useKittyKeyboard: true })!
    const key = new KeyEvent(rename ? { ...parsed, name: rename } : parsed)
    keys(key)
    return key
  }
  return { riffKeymap, leftKeys, brokenKeys, press, chordPending: () => keys.chordPending() }
}

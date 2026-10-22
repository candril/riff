import { onTestFinished } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { createRiffKeymap } from "../app/keymap"
import { composeKeys, type KeyHandler } from "../app/keys-dispatch"

export interface KeymapHarnessOptions {
  /** Whether the chain holds the first key of a chord. */
  chordPending?: () => boolean
}

/**
 * A real keymap in front of a chain that only records the names it is
 * handed. `press` takes a terminal sequence, or a key the parser cannot
 * produce (`name: "enter"`) spelled out over one it can. Call it inside a
 * test.
 */
export async function keymapHarness({ chordPending = () => false }: KeymapHarnessOptions = {}) {
  const rendered = await createTestRenderer({ width: 20, height: 4 })
  // Not a module-level afterEach: bun runs every test file in one process
  // and loads this module once, so such a hook would only ever clean up
  // after the first file that imports it, and each renderer left behind
  // keeps a listener on OpenTUI's process-wide console cache.
  onTestFinished(() => rendered.renderer.destroy())
  const riffKeymap = createRiffKeymap(rendered.renderer)
  const legacyKeys: string[] = []
  const legacy: KeyHandler = Object.assign((key: KeyEvent) => void legacyKeys.push(key.name), { chordPending })
  const keys = composeKeys(riffKeymap, legacy)
  const press = (sequence: string, rename?: string) => {
    const parsed = parseKeypress(sequence, { useKittyKeyboard: true })!
    const key = new KeyEvent(rename ? { ...parsed, name: rename } : parsed)
    keys(key)
    return key
  }
  return { riffKeymap, legacyKeys, press }
}

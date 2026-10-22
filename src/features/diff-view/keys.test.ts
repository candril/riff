import { expect, test } from "bun:test"
import type { KeyEvent } from "@opentui/core"
import { keymapHarness } from "../../testing/keymap-keys"
import { registerDiffKeys } from "./keys"
import { createInitialState, type AppState } from "../../state"
import { createCursorState } from "../../vim-diff/cursor-state"
import type { VimCursorState } from "../../vim-diff/types"

const DIFF: Partial<AppState> = { viewMode: "diff", focusedPanel: "diff" }
const TREE: Partial<AppState> = { viewMode: "diff", focusedPanel: "tree", showFilePanel: true }

/** The diff's layer on a real keymap, handleInput stubbed to take a key exactly when the diff is focused. */
async function diffKeys(patch: Partial<AppState> = DIFF, vim: Partial<VimCursorState> = {}) {
  const state: AppState = { ...createInitialState([], [], "test", ""), ...patch }
  const vimState: VimCursorState = { ...createCursorState(), ...vim }
  const handled: string[] = []
  const toggles: number[] = []
  const harness = await keymapHarness()
  registerDiffKeys(harness.riffKeymap, {
    getState: () => state,
    getVimState: () => vimState,
    toggleSplitView: () => void toggles.push(1),
    handle: (key: KeyEvent) => {
      handled.push(key.name)
      return state.focusedPanel === "diff"
    },
    chord: { chordPending: () => harness.chordPending() },
  })
  return { ...harness, handled, toggles }
}

/** A `]`-opened sequence above the diff, as the bracket layer holds one. */
function bracketAbove(keys: Awaited<ReturnType<typeof diffKeys>>) {
  keys.riffKeymap.keymap.registerLayer({
    commands: [{ name: "test.bracket", run: () => true }],
    bindings: [{ key: "]f", cmd: "test.bracket" }],
  })
}

test("with the diff focused, j goes to the diff and not to the chain", async () => {
  const keys = await diffKeys()
  keys.press("j")
  expect(keys.handled).toEqual(["j"])
  expect(keys.leftKeys).toEqual([])
})

test("with the tree focused, the diff declines the key and it reaches the chain", async () => {
  const keys = await diffKeys(TREE)
  const key = keys.press("j")
  expect(keys.handled).toEqual(["j"])
  expect(key.defaultPrevented).toBe(false)
  expect(keys.leftKeys).toEqual(["j"])
})

test("under a capture registered after it, the layer stands aside", async () => {
  const keys = await diffKeys()
  keys.riffKeymap.capture(() => true)
  keys.press("j")
  expect(keys.handled).toEqual([])
  expect(keys.leftKeys).toEqual([])
})

test("\\ toggles split with the diff focused and with the tree focused", async () => {
  for (const patch of [DIFF, TREE]) {
    const keys = await diffKeys(patch)
    keys.press("\\")
    expect(keys.toggles).toEqual([1])
    expect(keys.handled).toEqual([])
    expect(keys.leftKeys).toEqual([])
  }
})

test("\\ after f is the find character, and goes to the diff", async () => {
  const keys = await diffKeys(DIFF, { pendingFindChar: { type: "f" } })
  keys.press("\\")
  expect(keys.toggles).toEqual([])
  expect(keys.handled).toEqual(["\\"])
})

test("\\ that breaks off a pending sequence does not toggle, and goes to the diff", async () => {
  const keys = await diffKeys()
  bracketAbove(keys)
  keys.press("]")
  expect(keys.chordPending()).toBe(true)
  keys.press("\\")
  expect(keys.toggles).toEqual([])
  expect(keys.handled).toEqual(["\\"])
  expect(keys.leftKeys).toEqual([])
})

test("Ctrl-\\ does not toggle", async () => {
  const keys = await diffKeys()
  keys.press("\x1c")
  expect(keys.toggles).toEqual([])
})

test("a key that breaks off a sequence goes to the diff at the re-offer, not to the chain", async () => {
  const keys = await diffKeys()
  bracketAbove(keys)
  keys.press("]")
  keys.press("j")
  expect(keys.handled).toEqual(["j"])
  expect(keys.brokenKeys).toEqual([])
  expect(keys.leftKeys).toEqual([])
})

test("outside the diff view, the layer stands aside", async () => {
  for (const viewMode of ["feed", "state"] as const) {
    const keys = await diffKeys({ ...DIFF, viewMode })
    keys.press("j")
    keys.press("\\")
    expect(keys.handled).toEqual([])
    expect(keys.toggles).toEqual([])
    expect(keys.leftKeys).toEqual(["j", "\\"])
  }
})

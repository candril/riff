import { expect, test } from "bun:test"
import type { KeyEvent } from "@opentui/core"
import { keymapHarness } from "../../testing/keymap-keys"
import { registerTreeKeys } from "./keys"
import { createInitialState, type AppState } from "../../state"

const TREE: Partial<AppState> = { showFilePanel: true, focusedPanel: "tree" }

/** The tree's layer on a real keymap, with handleInput stubbed to take whatever `takes` says. */
async function treeKeys(patch: Partial<AppState> = TREE, { chordPending = false, takes = true } = {}) {
  const state: AppState = { ...createInitialState([], [], "test", ""), ...patch }
  const handled: string[] = []
  const settled: string[] = []
  const harness = await keymapHarness()
  registerTreeKeys(harness.riffKeymap, {
    getState: () => state,
    handle: (key: KeyEvent) => {
      handled.push(key.name)
      return takes
    },
    chain: { chordPendingAfter: () => chordPending, settleChord: (key) => void settled.push(key.name) },
  })
  return { ...harness, handled, settled }
}

test("with the tree focused, j goes to the tree and not to the chain", async () => {
  const keys = await treeKeys()
  keys.press("j")
  expect(keys.handled).toEqual(["j"])
  expect(keys.settled).toEqual(["j"])
  expect(keys.legacyKeys).toEqual([])
})

test("with focus elsewhere, or the file panel hidden, the key reaches the chain", async () => {
  for (const patch of [{ ...TREE, focusedPanel: "diff" as const }, { ...TREE, showFilePanel: false }]) {
    const keys = await treeKeys(patch)
    keys.press("j")
    expect(keys.handled).toEqual([])
    expect(keys.legacyKeys).toEqual(["j"])
  }
})

test("while the chain holds a chord, the key goes to the chain unsettled", async () => {
  const keys = await treeKeys(TREE, { chordPending: true })
  keys.press("j")
  expect(keys.handled).toEqual([])
  expect(keys.settled).toEqual([])
  expect(keys.legacyKeys).toEqual(["j"])
})

test("under a capture registered after it, the layer stands aside", async () => {
  const keys = await treeKeys()
  keys.riffKeymap.capture(() => true)
  keys.press("j")
  expect(keys.handled).toEqual([])
  expect(keys.legacyKeys).toEqual([])
})

test("a key the tree declines reaches the chain unprevented", async () => {
  const keys = await treeKeys(TREE, { takes: false })
  const key = keys.press("j")
  expect(keys.handled).toEqual(["j"])
  expect(key.defaultPrevented).toBe(false)
  expect(keys.legacyKeys).toEqual(["j"])
})

test("the keypad's slash, named kpdivide, goes to the tree", async () => {
  const keys = await treeKeys()
  keys.press("\x1b[57410u")
  expect(keys.handled).toEqual(["kpdivide"])
  expect(keys.legacyKeys).toEqual([])
})

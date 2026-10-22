import { expect, test } from "bun:test"
import { keymapHarness } from "../testing/keymap-keys"
import { registerGlobalKeys, type GlobalLayerKeyDeps } from "./global-layer-keys"
import { createInitialState, showToast, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import type { DiffFile } from "../utils/diff-parser"

const CTRL_F = "\x06"
const CTRL_P = "\x10"
const CTRL_SHIFT_P = "\x1b[112;6u"

const FILE: DiffFile = { filename: "src/a.ts", status: "modified", additions: 1, deletions: 1, content: "" }

/**
 * The global layer on a real keymap, in front of a chain that records the
 * names it is handed, with every side effect the layer can reach stubbed.
 */
async function globalKeys(patch: Partial<AppState> = {}, chordPending = false) {
  let state: AppState = { ...createInitialState([], [], "test", ""), ...patch }
  const calls: string[] = []
  const harness = await keymapHarness()
  const deps: GlobalLayerKeyDeps = {
    getState: () => state,
    setState: (update) => (state = update(state)),
    render: () => {},
    getVimState: () => createCursorState(),
    setVimState: () => {},
    getLineMapping: () => {
      throw new Error("the line mapping was read")
    },
    quit: () => void calls.push("quit"),
    addComment: () => void calls.push("addComment"),
    jumpApply: null as never,
    goToBottom: () => void calls.push("goToBottom"),
    openBranchPr: (view) => void calls.push(`openBranchPr:${view}`),
    loadFeed: () => void calls.push("loadFeed"),
    updateFileTreePanel: () => {},
    startListFlash: (surface) => void calls.push(`flash:${surface}`),
    flashTargets: () => [],
    openCommentsOverlay: () => false,
    openCommentsPanelForCursor: () => void calls.push("threads"),
    chain: { chordPending: () => chordPending },
  }
  registerGlobalKeys(harness.riffKeymap, deps)
  return { ...harness, state: () => state, calls }
}

test("Ctrl-f opens the file picker and prevents the key, so the picker's field does not type it", async () => {
  const keys = await globalKeys({ files: [FILE] })
  const key = keys.press(CTRL_F)
  expect(keys.state().filePicker.open).toBe(true)
  expect(key.defaultPrevented).toBe(true)
  expect(keys.leftKeys).toEqual([])
})

test("Ctrl-f with no files is declined, unprevented, and reaches the chain", async () => {
  const keys = await globalKeys()
  const key = keys.press(CTRL_F)
  expect(keys.state().filePicker.open).toBe(false)
  expect(key.defaultPrevented).toBe(false)
  expect(keys.leftKeys).toEqual(["f"])
})

test("Ctrl-p and Ctrl-Shift-p both open the palette, as the chain matched the name alone", async () => {
  const plain = await globalKeys()
  plain.press(CTRL_P)
  expect(plain.state().actionMenu.open).toBe(true)

  const shifted = await globalKeys()
  shifted.press(CTRL_SHIFT_P)
  expect(shifted.state().actionMenu.open).toBe(true)
  expect(shifted.leftKeys).toEqual([])
})

test("q and Shift-q quit, and the key is left unprevented as the chain left it", async () => {
  const keys = await globalKeys()
  expect(keys.press("q").defaultPrevented).toBe(false)
  keys.press("Q")
  expect(keys.calls.filter((call) => call === "quit")).toHaveLength(2)
  expect(keys.leftKeys).toEqual([])
})

test("a capitalised Q, which no case of the chain named, reaches the chain rather than quitting", async () => {
  const keys = await globalKeys()
  keys.press("q", "Q")
  expect(keys.calls).not.toContain("quit")
  expect(keys.leftKeys).toEqual(["Q"])
})

test("Shift-c and Shift-e hand the line to $EDITOR, and a bare c reaches the chain", async () => {
  const keys = await globalKeys()
  keys.press("C")
  keys.press("E")
  keys.press("c")
  expect(keys.calls.filter((call) => call === "addComment")).toHaveLength(2)
  expect(keys.leftKeys).toEqual(["c"])
})

test("in the tree, G as kitty names it goes to the bottom without a binding of its own", async () => {
  const keys = await globalKeys({ focusedPanel: "tree" })
  keys.press("g", "G")
  keys.press("G")
  expect(keys.calls.filter((call) => call === "goToBottom")).toHaveLength(2)
  keys.press("g")
  expect(keys.leftKeys).toEqual(["g"])
})

test("while the chain holds a chord every global key is declined for the chain to complete", async () => {
  const keys = await globalKeys({}, true)
  keys.press("q")
  keys.press(CTRL_P)
  expect(keys.calls).toEqual([])
  expect(keys.state().actionMenu.open).toBe(false)
  expect(keys.leftKeys).toEqual(["q", "p"])
})

test("under a capture holding the key, the layer stands aside", async () => {
  const keys = await globalKeys()
  keys.riffKeymap.capture(() => true)
  keys.press("q")
  expect(keys.calls).toEqual([])
  expect(keys.leftKeys).toEqual([])
})

test("a capture that leaves the key lets the layer take it", async () => {
  const keys = await globalKeys()
  keys.riffKeymap.capture((key) => key.name !== "p" || !key.ctrl)
  keys.press(CTRL_P)
  expect(keys.state().actionMenu.open).toBe(true)
})

test("Esc with no toast is declined and unprevented; with one it clears it", async () => {
  const keys = await globalKeys()
  const declined = keys.press("\x1b")
  expect(declined.defaultPrevented).toBe(false)
  expect(keys.leftKeys).toEqual(["escape"])

  const toasted = await globalKeys({ toast: showToast(createInitialState([], [], "test", ""), "saved").toast })
  toasted.press("\x1b")
  expect(toasted.state().toast.message).toBeFalsy()
  expect(toasted.leftKeys).toEqual([])
})

import { afterEach, expect, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn } from "../testing/chat-keys"
import { treeRowsOf } from "../components"
import { showToast } from "../state"

const fileDiff = (name: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
`

const DIFF = fileDiff("src/greet.ts") + fileDiff("src/other.ts")
const KEYPAD_SLASH = "\x1b[57410u"

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** riff's keys through the real createAppKeys with the tree focused, and what its keys reach stubbed. */
async function treeApp() {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  app.show({ focusedPanel: "tree", showFilePanel: true, treeHighlightIndex: 0 })
  const mounted = app
  const unviewedOnly: number[] = []
  const rebuilt: number[] = []
  const keys = keysOn(mounted, {
    fileTreePanel: mounted.fileTreePanel,
    updateFileTreePanel: mounted.ctx.updateFileTreePanel,
    rebuildLineMapping: () => void rebuilt.push(1),
    toggleUnviewedFilesOnly: () => void unviewedOnly.push(1),
  })
  mounted.ctx.updateFileTreePanel()
  await mounted.frame()
  const state = () => mounted.ctx.getState()
  const rows = treeRowsOf(state())
  return { mounted, keys, state, rows, unviewedOnly, rebuilt }
}

test("j, down and k move the highlight, and Ctrl-d and Ctrl-u move half a page", async () => {
  const { mounted, state, rows } = await treeApp()
  expect(rows.length).toBeGreaterThan(2)
  mounted.setup.mockInput.pressKey("j")
  expect(state().treeHighlightIndex).toBe(1)
  mounted.setup.mockInput.pressArrow("down")
  expect(state().treeHighlightIndex).toBe(2)
  mounted.setup.mockInput.pressKey("k")
  expect(state().treeHighlightIndex).toBe(1)

  ctrl(mounted, "d")
  expect(state().treeHighlightIndex).toBe(rows.length - 1)
  ctrl(mounted, "u")
  expect(state().treeHighlightIndex).toBe(0)
  expect(state().focusedPanel).toBe("tree")
})

test("Enter on a file focuses the diff", async () => {
  const { mounted, state, rows, rebuilt } = await treeApp()
  const file = rows.findIndex((row) => typeof row.fileIndex === "number")
  mounted.show({ treeHighlightIndex: file, selectedFileIndex: 0 })
  mounted.setup.mockInput.pressEnter()
  expect(state().focusedPanel).toBe("diff")
  expect(state().selectedFileIndex).toBe(rows[file]!.fileIndex!)
  expect(rebuilt).toHaveLength(1)
})

test("g then j, a chord broken off, still moves the highlight down", async () => {
  const { mounted, keys, state } = await treeApp()
  mounted.setup.mockInput.pressKey("g")
  expect(keys.chordPending()).toBe(true)
  mounted.setup.mockInput.pressKey("j")
  expect(keys.chordPending()).toBe(false)
  expect(state().treeHighlightIndex).toBe(1)
})

test("a plain slash and the keypad's slash both start the tree filter, through the tree's layer", async () => {
  for (const slash of ["/", KEYPAD_SLASH]) {
    const { mounted, keys, state } = await treeApp()
    // The leftover opens the filter on any key spelled "/" too, so the
    // filter opening alone would not show the layer took the keypad's.
    const ran: string[] = []
    keys.keymap.on("dispatch", (event) => {
      if (event.phase === "binding-execute" && typeof event.command === "string") ran.push(event.command)
    })
    mounted.setup.renderer.keyInput.emit("keypress", new KeyEvent(parseKeypress(slash, { useKittyKeyboard: true })!))
    expect({ slash, filtering: state().treeFilterInput, ran }).toEqual({ slash, filtering: true, ran: ["tree.key"] })
    await app!.dispose()
    app = null
  }
})

test("a modified slash on a layout where / is shifted, named after its base key, starts the tree filter", async () => {
  for (const slash of ["\x1b[55:47;6u", "\x1b[55:47;4u"]) {
    const { mounted, state } = await treeApp()
    const parsed = parseKeypress(slash, { useKittyKeyboard: true })!
    expect({ name: parsed.name, sequence: parsed.sequence }).toEqual({ name: "7", sequence: "/" })
    mounted.setup.renderer.keyInput.emit("keypress", new KeyEvent(parsed))
    expect({ slash, filtering: state().treeFilterInput }).toEqual({ slash, filtering: true })
    await app!.dispose()
    app = null
  }
})

test("Shift-h toggles unviewed files only", async () => {
  const { mounted, unviewedOnly, state } = await treeApp()
  mounted.setup.mockInput.pressKey("h", { shift: true })
  expect(unviewedOnly).toHaveLength(1)
  expect(state().focusedPanel).toBe("tree")
})

test("with a toast up, the first Escape clears it in the tree and the next leaves the tree", async () => {
  const { mounted, state } = await treeApp()
  mounted.show({ toast: showToast(state(), "saved").toast })
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  mounted.setup.mockInput.pressEscape()
  await Bun.sleep(50)
  expect(state().toast.message).toBeFalsy()
  expect(state().focusedPanel).toBe("tree")
  mounted.setup.mockInput.pressEscape()
  await Bun.sleep(50)
  expect(state().focusedPanel).toBe("diff")
})

test("Ctrl-l from the tree moves focus right", async () => {
  const { mounted, state } = await treeApp()
  ctrl(mounted, "l")
  expect(state().focusedPanel).toBe("diff")
})

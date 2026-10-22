import { afterEach, expect, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import type { GlobalKeyContext } from "./global-keys"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"

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

const DIFF = ["a.ts", "b.ts"].map(fileDiff).join("")

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** riff's keys through the real createAppKeys, with the marks wired to the app's own state. */
async function markApp(more: Partial<GlobalKeyContext> = {}) {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  app.show({ focusedPanel: "diff", showFilePanel: true, treeHighlightIndex: 0 })
  const mounted = app
  const { ctx: render } = mounted
  let keys!: ReturnType<typeof keysOn>
  const vim = () => keys.vimState()
  const setVimState: GlobalKeyContext["setVimState"] = (next) => keys.setVim(next)
  const rebuildLineMapping = () => mounted.show({ files: render.getState().files })
  const fileNavContext = {
    getState: render.getState,
    setState: render.setState,
    getVimState: vim,
    setVimState,
    getLineMapping: render.getLineMapping,
    createLineMapping: rebuildLineMapping,
    ensureCursorVisible: () => {},
    render: mounted.render,
    getHeadSha: () => "abc1234",
    setHeadSha: () => {},
    source: "test",
    mode: "local",
    prInfo: null,
  } as unknown as GlobalKeyContext["fileNavContext"]
  keys = keysOn(mounted, {
    rebuildLineMapping,
    fileTreePanel: mounted.fileTreePanel,
    updateFileTreePanel: render.updateFileTreePanel,
    fileNavContext,
    marksContext: {
      getState: render.getState,
      setState: render.setState,
      getVimState: vim,
      setVimState,
      getLineMapping: render.getLineMapping,
      getPane: () => null,
      setPane: () => {},
      ensureCursorVisible: () => {},
      render: mounted.render,
      fileNavContext,
      save: () => {},
      getHead: () => undefined,
    },
    ...more,
  })
  render.updateFileTreePanel()
  await mounted.frame()
  const press = (sequence: string) =>
    mounted.setup.renderer.keyInput.emit("keypress", new KeyEvent(parseKeypress(sequence, { useKittyKeyboard: true })!))
  const type = (...sequences: string[]) => sequences.forEach(press)
  const state = () => render.getState()
  const marks = () => state().marks.marks.map((mark) => mark.letter)
  /** The cursor on the first changed line of a.ts, where a mark has a file to sit in. */
  const toCode = () => {
    const line = render.getLineMapping().allLines.findIndex((row) => row.content.includes("hello"))
    keys.setVim({ line, col: 0 })
    return line
  }
  return { mounted, keys, type, state, marks, toCode, vim }
}

test("m then a sets mark a", async () => {
  const { type, marks, toCode, keys } = await markApp()
  toCode()
  type("m", "a")
  expect(marks()).toEqual(["a"])
  expect(keys.chordPending()).toBe(false)
})

test("a pending m gives way once the diff loses the keys: the next key moves the tree, and no mark is set", async () => {
  const { mounted, type, state, marks, toCode, keys } = await markApp()
  toCode()
  type("m")
  expect(keys.chordPending()).toBe(true)
  // As a click into the tree would.
  mounted.ctx.setState((s) => ({ ...s, focusedPanel: "tree" }))
  type("j")
  expect(state().treeHighlightIndex).toBe(1)
  expect(keys.chordPending()).toBe(false)
  type("a")
  expect(marks()).toEqual([])
})

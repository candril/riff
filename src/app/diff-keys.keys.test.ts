import { afterEach, expect, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import type { AppKeyContext } from "./key-context"
import { routeDiffViewport } from "./diff-viewport"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { SearchHandler } from "../vim-diff/search-handler"
import type { FoldsContext } from "../features/folds"
import { adoptReloadedState } from "../features/refresh/handlers"
import { reloadCtx } from "../testing/app-render"
import { failOnKeymapErrors } from "../testing/keymap-errors"
import { createInitialState } from "../state"

const fileDiff = (name: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hex"
 }
`

const DIFF = ["a.ts", "b.ts"].map(fileDiff).join("")
const SHIFT_G = "\x1b[71;2u"

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** riff's keys through the real createAppKeys with the diff focused, and what its motions reach wired to the app. */
async function diffApp(more: Partial<AppKeyContext> = {}) {
  // Split draws once the diff's pane is 120 columns wide.
  app = await mountApp(DIFF, { width: 160, height: 30 })
  app.show({ focusedPanel: "diff" })
  const mounted = app
  const { ctx: render } = mounted
  const cursorView = routeDiffViewport(render.unified, {
    shown: render.split.shown,
    island: render.split.island,
    rowAtLine: render.split.rowAtLine,
    refreshCursor: () => {},
  })
  let keys!: ReturnType<typeof keysOn>
  const vim = () => keys.vimState()
  const setVimState: AppKeyContext["setVimState"] = (next) => keys.setVim(next)
  const rebuildLineMapping = () => mounted.show({ files: render.getState().files })
  const foldsContext: FoldsContext = {
    getState: render.getState,
    setState: render.setState,
    blockFolds: mounted.blockFolds,
    getVimState: vim,
    setVimState,
    getLineMapping: render.getLineMapping,
    rebuildLineMapping,
    getFileTreePanel: () => mounted.fileTreePanel,
    getCursorView: () => cursorView,
    updateFileTreePanel: render.updateFileTreePanel,
    ensureCursorVisible: () => {},
    render: mounted.render,
  }
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
  } as unknown as AppKeyContext["fileNavContext"]
  const searchHandler = new SearchHandler({
    getMapping: render.getLineMapping,
    getSearchState: render.getSearchState,
    setSearchState: mounted.setSearchState,
    getCursor: render.getVimState,
    setCursor: () => {},
    getFileContent: () => null,
    loadFileContent: async () => {},
    expandDividerForLine: () => {},
    getCollapsedFiles: () => [],
    expandFiles: () => {},
    onUpdate: mounted.render,
  })
  mounted.onSearchPattern((value) => searchHandler.updatePattern(value))
  keys = keysOn(mounted, {
    cursorView,
    foldsContext,
    fileNavContext,
    rebuildLineMapping,
    getSearchState: render.getSearchState,
    searchHandler,
    marksContext: {
      getState: render.getState,
      blockFolds: mounted.blockFolds,
      getVimState: vim,
      setVimState,
      getLineMapping: render.getLineMapping,
      getPane: () => null,
      setPane: () => {},
      ensureCursorVisible: () => {},
      render: mounted.render,
      toast: mounted.toast,
      fileNavContext,
      marks: mounted.marks,
      save: () => {},
      getHead: () => undefined,
    },
    ...more,
  })
  await mounted.frame()
  const press = (sequence: string) =>
    mounted.setup.renderer.keyInput.emit("keypress", new KeyEvent(parseKeypress(sequence, { useKittyKeyboard: true })!))
  const type = (...sequences: string[]) => sequences.forEach(press)
  const lineOf = (content: string, file = "a.ts") =>
    render.getLineMapping().allLines.findIndex((line) => line.content === content && line.filename === file)
  const cursorFile = () => render.getLineMapping().getLine(vim().line)?.filename
  /** The frame's rows that draw both sides of the changed line on one row, as only split does. */
  const sideBySide = async () =>
    (await mounted.frame()).split("\n").filter((row) => row.includes('return "hi"') && row.includes('return "hex"'))
  return { mounted, keys, type, vim, lineOf, cursorFile, sideBySide }
}

test("j moves the cursor line", async () => {
  const { type, vim } = await diffApp()
  const before = vim().line
  type("j")
  expect(vim().line).toBe(before + 1)
})

test("\\ draws the split panes, and \\ again draws unified", async () => {
  const { mounted, type, sideBySide } = await diffApp()
  expect(await sideBySide()).toEqual([])
  type("\\")
  expect(mounted.diffOptions.splitView()).toBe(true)
  expect((await sideBySide()).length).toBeGreaterThan(0)
  type("\\")
  expect(mounted.diffOptions.splitView()).toBe(false)
  expect(await sideBySide()).toEqual([])
})

test("split asked for with \\ is still drawn after gr reloads the diff", async () => {
  const reloaded: string[] = []
  const { mounted, keys, type, sideBySide } = await diffApp({
    // The swap handleRefresh ends in, over the files it already has.
    refreshContext: {
      handleRefresh: async () => {
        adoptReloadedState(reloadCtx(mounted), (prev) => ({
          ...createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"),
          focusedPanel: "diff",
        }))
        mounted.render()
        reloaded.push("reloaded")
      },
    },
  })
  failOnKeymapErrors(keys)
  type("\\")
  expect((await sideBySide()).length).toBeGreaterThan(0)

  type("g", "r")
  expect(reloaded).toEqual(["reloaded"])
  expect(mounted.ctx.getState().description).toBe("reloaded")
  expect(mounted.diffOptions.splitView()).toBe(true)
  expect((await sideBySide()).length).toBeGreaterThan(0)
})

test("/ opens the search prompt, and the / is not typed into it", async () => {
  const { mounted, type } = await diffApp()
  type("/")
  expect(mounted.ctx.getSearchState().active).toBe(true)
  expect(mounted.ctx.getSearchState().pattern).toBe("")
  const searchLine = (await mounted.frame()).split("\n").find((row) => row.trimStart().startsWith("/"))
  expect(searchLine?.trim()).toBe("/")
})

test("gg after G goes to the top, so the diff does not shadow the g sequence", async () => {
  const { mounted, type, keys, vim } = await diffApp()
  type(SHIFT_G)
  expect(vim().line).toBe(mounted.ctx.getLineMapping().lineCount - 1)
  type("g", "g")
  expect(vim().line).toBe(0)
  expect(keys.chordPending()).toBe(false)
})

test("]f steps a file", async () => {
  const { type, cursorFile } = await diffApp()
  expect(cursorFile()).toBe("a.ts")
  type("]", "f")
  expect(cursorFile()).toBe("b.ts")
})

test("ma then 'a jumps back to the mark", async () => {
  const { type, keys, vim, lineOf } = await diffApp()
  const marked = lineOf('  return "hex"')
  keys.setVim({ line: marked, col: 0 })
  type("m", "a")
  keys.setVim({ line: 0, col: 0 })
  type("'", "a")
  expect(vim().line).toBe(marked)
})

test("fx moves to the x, as a find character", async () => {
  const { type, keys, vim, lineOf } = await diffApp()
  const line = lineOf('  return "hex"')
  keys.setVim({ line, col: 0 })
  type("f", "x")
  expect(vim().line).toBe(line)
  expect(vim().col).toBe('  return "hex"'.indexOf("x"))
})

import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import type { AppKeyContext } from "./key-context"
import { createJumpRecording } from "./jump-recording"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { BLAME_TARGET } from "../testing/peek-keys"
import * as folds from "../features/folds"

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

const SHIFT_A = "\x1b[97;2u"
const SHIFT_CAPITAL_A = "\x1b[65;2u"
const CTRL_A = "\x1b[97;5u"
const CTRL_R = "\x12"
const F12 = "\x1b[24~"
/** `'` on a German layout: Shift-#, which kitty reports as `#` with the text `'`. */
const DE_QUOTE = "\x1b[35:39;2u"

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** riff's keys through the real createAppKeys, with the marks wired to the app's own state. */
async function markApp(more: Partial<AppKeyContext> = {}, { recordJumps = false } = {}) {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  app.show({ focusedPanel: "diff", showFilePanel: true, treeHighlightIndex: 0 })
  const mounted = app
  const { ctx: render } = mounted
  let keys!: ReturnType<typeof keysOn>
  const vim = () => keys.vimState()
  const setVimState: AppKeyContext["setVimState"] = (next) => keys.setVim(next)
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
  } as unknown as AppKeyContext["fileNavContext"]
  // Through app.ts's own recording, around riff's listener.
  const recording = createJumpRecording({
    getState: render.getState,
    jumpList: mounted.jumpList,
    filePicker: mounted.filePicker,
    commentsPicker: mounted.commentsPicker,
    occurrencePicker: mounted.occurrencePicker,
    marksPicker: mounted.marksPicker,
    commitPicker: mounted.commitPicker,
    actionMenu: mounted.actionMenu,
    activityFeed: mounted.activityFeed,
    getVimState: vim,
    getLineMapping: render.getLineMapping,
    getPane: () => null,
    searchActive: () => false,
    flashActive: () => false,
    chordPending: () => keys.chordPending(),
  })
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
      marks: mounted.marks,
      save: () => {},
      getHead: () => undefined,
    },
    ...more,
  }, recordJumps ? (key, dispatch) => recording.around(key, dispatch) : undefined)
  render.updateFileTreePanel()
  await mounted.frame()
  const press = (sequence: string) =>
    mounted.setup.renderer.keyInput.emit("keypress", new KeyEvent(parseKeypress(sequence, { useKittyKeyboard: true })!))
  const type = (...sequences: string[]) => sequences.forEach(press)
  const state = () => render.getState()
  const marks = () => mounted.marks.marks().map((mark) => mark.letter)
  /** The cursor on the line of `file` that reads `text`, where a mark has a file to sit in. */
  const lineOf = (file: string, text: string) =>
    render.getLineMapping().allLines.findIndex((row) => row.filename === file && row.content.includes(text))
  const moveTo = (line: number) => keys.setVim({ line, col: 0 })
  const toCode = () => {
    const line = lineOf("a.ts", "hello")
    moveTo(line)
    return line
  }
  return { mounted, keys, type, state, marks, toCode, lineOf, moveTo, vim }
}

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

describe("setting and jumping", () => {
  test("ma sets mark a at the cursor", async () => {
    const { mounted, type, marks, toCode, keys } = await markApp()
    toCode()
    type("m")
    expect(keys.chordPending()).toBe(true)
    type("a")
    expect(marks()).toEqual(["a"])
    expect(mounted.marks.marks()[0]).toMatchObject({ filename: "a.ts", side: "RIGHT", line: 2 })
    expect(keys.chordPending()).toBe(false)
  })

  test("mA sets mark A, in either kitty spelling of shift+a", async () => {
    for (const shiftA of [SHIFT_A, SHIFT_CAPITAL_A]) {
      const { type, marks, toCode } = await markApp()
      toCode()
      type("m", shiftA)
      expect(marks()).toEqual(["A"])
      await app!.dispose()
      app = null
    }
  })

  test("Ctrl-a after m sets mark a, as ctrl is ignored on the second key", async () => {
    const { type, marks, toCode } = await markApp()
    toCode()
    type("m", CTRL_A)
    expect(marks()).toEqual(["a"])
  })

  test("'a jumps to mark a", async () => {
    const { type, toCode, moveTo, vim, keys } = await markApp()
    const marked = toCode()
    type("m", "a")
    moveTo(0)
    type("'")
    expect(keys.chordPending()).toBe(true)
    type("a")
    expect(vim().line).toBe(marked)
    expect(keys.chordPending()).toBe(false)
  })

  test("'' flips back to the mark visited before", async () => {
    const { type, lineOf, moveTo, vim } = await markApp()
    const a = lineOf("a.ts", "hello")
    const b = lineOf("b.ts", "hello")
    moveTo(a)
    type("m", "a")
    moveTo(b)
    type("m", "b")
    type("'", "a", "'", "b")
    expect(vim().line).toBe(b)
    type("'", "'")
    expect(vim().line).toBe(a)
  })

  test("m waits past 600 ms for its letter", async () => {
    const { type, marks, toCode, keys } = await markApp()
    toCode()
    type("m")
    await Bun.sleep(650)
    expect(keys.chordPending()).toBe(true)
    type("a")
    expect(marks()).toEqual(["a"])
  })
})

describe("any other second key", () => {
  test("m then ] or 1 is swallowed, and the next j moves the cursor", async () => {
    for (const other of ["]", "1"]) {
      const { type, marks, toCode, vim, keys } = await markApp()
      const line = toCode()
      type("m", other)
      expect(vim().line).toBe(line)
      expect(keys.chordPending()).toBe(false)
      expect(marks()).toEqual([])
      type("j")
      expect(vim().line).toBe(line + 1)
      await app!.dispose()
      app = null
    }
  })

  test("\\ right after m does not toggle the split view", async () => {
    const { type, state, toCode, keys } = await markApp()
    toCode()
    type("m", "\\")
    expect(state().splitView).toBe(false)
    expect(keys.chordPending()).toBe(false)
  })
})

describe("keys asked ahead of the chord", () => {
  test("m then Ctrl-r opens the chat and sets no mark", async () => {
    const { type, state, marks, toCode, keys } = await markApp()
    toCode()
    type("m", CTRL_R)
    expect([state().chatOpen, state().focusedPanel]).toEqual([true, "chat"])
    expect(keys.chordPending()).toBe(false)
    expect(marks()).toEqual([])
  })

  test("m then F12 toggles the debug console, as the app layer ignores chords", async () => {
    const { mounted, type, toCode, keys } = await markApp()
    toCode()
    const toggle = spyOn(mounted.setup.renderer.console, "toggle").mockImplementation(() => {})
    type("m", F12)
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(keys.chordPending()).toBe(false)
  })
})

describe("where no mark chord opens", () => {
  test("m with the tree focused opens no chord", async () => {
    const { mounted, type, marks, keys } = await markApp()
    mounted.show({ focusedPanel: "tree" })
    type("m")
    expect(keys.chordPending()).toBe(false)
    mounted.show({ focusedPanel: "diff" })
    type("a")
    expect(marks()).toEqual([])
  })

  test("a pending ' gives way too once the diff loses the keys", async () => {
    const { mounted, type, state, toCode, keys } = await markApp()
    toCode()
    type("'")
    expect(keys.chordPending()).toBe(true)
    mounted.ctx.setState((s) => ({ ...s, focusedPanel: "tree" }))
    type("j")
    expect(state().treeHighlightIndex).toBe(1)
    expect(keys.chordPending()).toBe(false)
  })

  test("a pending ' typed as German Shift-# gives way too, and jumps to no mark", async () => {
    const { mounted, type, state, toCode, moveTo, vim, keys } = await markApp()
    toCode()
    type("m", "a")
    moveTo(0)
    type(DE_QUOTE)
    expect(keys.chordPending()).toBe(true)
    mounted.ctx.setState((s) => ({ ...s, focusedPanel: "tree" }))
    type("j")
    expect(state().treeHighlightIndex).toBe(1)
    expect(keys.chordPending()).toBe(false)
    expect(vim().line).toBe(0)
  })

  test("the ' that breaks off ] opens no mark chord, so ]'a jumps nowhere", async () => {
    const { type, toCode, moveTo, vim, keys } = await markApp()
    toCode()
    type("m", "a")
    moveTo(0)
    type("]", "'")
    expect(keys.chordPending()).toBe(false)
    type("a")
    expect(vim().line).toBe(0)
  })

  test("]m still steps to the next mark", async () => {
    const { type, toCode, moveTo, vim } = await markApp()
    const marked = toCode()
    type("m", "a")
    moveTo(0)
    type("]", "m")
    expect(vim().line).toBe(marked)
  })

  test("gm opens no mark chord, and zm folds every file", async () => {
    const collapse = spyOn(folds, "handleCollapseAllFolds").mockImplementation(() => {})
    try {
      const { type, marks, toCode, keys } = await markApp()
      toCode()
      type("g", "m")
      expect(keys.chordPending()).toBe(false)
      type("a")
      type("z", "m")
      expect(collapse).toHaveBeenCalledTimes(1)
      expect(keys.chordPending()).toBe(false)
      type("a")
      expect(marks()).toEqual([])
    } finally {
      collapse.mockRestore()
    }
  })

  test("fm finds an m and vi' selects quotes: neither is a chord", async () => {
    const { type, marks, toCode, keys } = await markApp()
    toCode()
    type("f", "m")
    expect(keys.chordPending()).toBe(false)
    type("a")
    expect(marks()).toEqual([])
    type("v", "i", "'")
    expect(keys.chordPending()).toBe(false)
    expect(keys.vimState().pendingTextObject).toBeNull()
  })

  test("under the blame peek, m is the peek's", async () => {
    const { mounted, type, marks, toCode, keys } = await markApp()
    toCode()
    mounted.blamePeek.show(BLAME_TARGET)
    mounted.show()
    type("m")
    expect(keys.chordPending()).toBe(false)
    type("a")
    expect(marks()).toEqual([])
    expect(mounted.blamePeek.open()).toBe(true)
  })
})

test("the jump recorder records 'a as one jump, from where ' was pressed", async () => {
  const { mounted, type, toCode, moveTo, vim } = await markApp({}, { recordJumps: true })
  const marked = toCode()
  type("m", "a")
  moveTo(0)
  const pushed = () => mounted.jumpList.list().entries.map((jump) => jump.cursorLine)
  type("'")
  expect(pushed()).toEqual([])
  type("a")
  expect(vim().line).toBe(marked)
  expect(pushed()).toEqual([0])
})

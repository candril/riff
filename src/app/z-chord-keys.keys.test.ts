import { afterEach, describe, expect, setSystemTime, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import type { AppKeyContext } from "./key-context"
import { routeDiffViewport, type DiffViewport } from "./diff-viewport"
import { registerZChordKeys } from "./z-chord-keys"
import { registerChordStrokes, sequenceSuffixes } from "./chord-stroke"
import { Z_SEQUENCES, type ZChordDeps } from "./z-chord-commands"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { keymapHarness } from "../testing/keymap-keys"
import { FEED_EVENTS } from "../testing/feed-keys"
import { PR_NOW } from "../testing/pr-info"
import { fullPr } from "../testing/pr-info-panel"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
import { createInitialState, openInlineCommentOverlay } from "../state"
import { createSearchState } from "../vim-diff/search-state"
import { createComment } from "../types"
import type { FoldsContext } from "../features/folds"

const WIDE = `  const wide = "${"x".repeat(200)}"`

const fileDiff = (name: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,4 +1,4 @@
 export function greet() {
-  return "hi"
+  return "hello"
${WIDE}
 }
`

const DOC = `diff --git a/doc.md b/doc.md
index 1111111..2222222 100644
--- a/doc.md
+++ b/doc.md
@@ -1,6 +1,6 @@
 intro
 ~~~sh
-echo hi
+echo hello
 ~~~
 between
 end
`

const DIFF = `${["a.ts", "b.ts"].map(fileDiff).join("")}${DOC}`

const TWO_BLOCKS = `diff --git a/doc.md b/doc.md
index 1111111..2222222 100644
--- a/doc.md
+++ b/doc.md
@@ -1,8 +1,8 @@
 intro
 ~~~sh
-echo hi
+echo hello
 ~~~
 between
 ~~~js
 log()
 ~~~
`

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** riff's keys through the real createAppKeys, every scroll the z chords ask of the diff recorded. */
async function zApp(more: Partial<AppKeyContext> = {}, diff = DIFF) {
  app = await mountApp(diff, { width: 120, height: 30 })
  app.show({ focusedPanel: "diff" })
  const mounted = app
  const { ctx: render } = mounted
  const scrolls: string[] = []
  const viewport = routeDiffViewport(render.unified, {
    shown: render.split.shown,
    island: render.split.island,
    rowAtLine: render.split.rowAtLine,
    refreshCursor: () => {},
  })
  const cursorView: DiffViewport = {
    ...viewport,
    scrollCursorTo(line, where) {
      scrolls.push(where)
      viewport.scrollCursorTo(line, where)
    },
    scrollColumnsBy(delta) {
      scrolls.push(`columns ${delta}`)
      viewport.scrollColumnsBy(delta)
    },
    scrollColumnToEdge(line, col, edge) {
      scrolls.push(`column ${edge}`)
      viewport.scrollColumnToEdge(line, col, edge)
    },
  }
  let keys!: ReturnType<typeof keysOn>
  const vim = () => keys.vimState()
  const setVimState: AppKeyContext["setVimState"] = (next) => keys.setVim(next)
  const rebuildLineMapping = () => mounted.show({ files: render.getState().files })
  const foldsContext: FoldsContext = {
    getState: render.getState,
    setState: render.setState,
    blockFolds: mounted.blockFolds,
    fileFolds: mounted.fileFolds,
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
  keys = keysOn(mounted, {
    cursorView,
    foldsContext,
    rebuildLineMapping,
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
      marks: mounted.marks,
      save: () => {},
      getHead: () => undefined,
    } as unknown as AppKeyContext["marksContext"],
    ...more,
  })
  await mounted.frame()
  const press = (sequence: string) =>
    mounted.setup.renderer.keyInput.emit("keypress", new KeyEvent(parseKeypress(sequence, { useKittyKeyboard: true })!))
  const type = (...sequences: string[]) => sequences.forEach(press)
  const lineOf = (content: string, file = "a.ts") =>
    render.getLineMapping().allLines.findIndex((line) => line.content === content && line.filename === file)
  const cursorFile = () => render.getLineMapping().getLine(vim().line)?.filename
  const state = () => render.getState()
  return { mounted, keys, type, scrolls, viewport, lineOf, cursorFile, state }
}

const SHIFT_A = "\x1b[65;2u"
const SHIFTED_LOWER_A = "\x1b[97;2u"

describe("the cursor's line", () => {
  test("zz, zt and zb scroll it to the centre, the top and the bottom", async () => {
    const { type, scrolls, keys } = await zApp()
    type("z", "z", "z", "t", "z", "b")
    expect(scrolls).toEqual(["center", "top", "bottom"])
    expect(keys.chordPending()).toBe(false)
  })

  test("z then Ctrl-z is zz, the second key's ctrl ignored", async () => {
    const { type, scrolls } = await zApp()
    type("z", "\x1a")
    expect(scrolls).toEqual(["center"])
  })
})

describe("folds", () => {
  test("za folds the file the cursor is in, and unfolds it again", async () => {
    const { mounted, type, lineOf, keys } = await zApp()
    keys.jumpTo(lineOf('  return "hello"'))
    type("z", "a")
    expect([...mounted.fileFolds.collapsed()]).toEqual(["a.ts"])
    type("z", "a")
    expect(mounted.fileFolds.collapsed().size).toBe(0)
  })

  test("zc on a file's body hides its lines under its header, and zo brings them back", async () => {
    const { mounted, type, lineOf, keys } = await zApp()
    const hellos = (frame: string) => frame.split('return "hello"').length - 1
    expect(hellos(await mounted.frame())).toBe(2)

    keys.jumpTo(lineOf('  return "hello"'))
    type("z", "c")
    const folded = await mounted.frame()
    expect(hellos(folded)).toBe(1)
    expect(folded).toContain("▶   a.ts")

    type("z", "o")
    const unfolded = await mounted.frame()
    expect(hellos(unfolded)).toBe(2)
    expect(unfolded).toContain("▼   a.ts")
  })

  test("zM hides every file's lines under its header, and zR brings them back", async () => {
    const { mounted, type } = await zApp()
    type("z", "\x1b[77;2u")
    const folded = await mounted.frame()
    expect(folded).not.toContain('return "hello"')
    expect(folded).not.toContain("between")
    for (const file of ["a.ts", "b.ts", "doc.md"]) expect(folded).toContain(`▶   ${file}`)

    type("z", "\x1b[82;2u")
    const unfolded = await mounted.frame()
    expect(unfolded.split('return "hello"').length - 1).toBe(2)
    expect(unfolded).toContain("between")
    for (const file of ["a.ts", "b.ts", "doc.md"]) expect(unfolded).toContain(`▼   ${file}`)
  })

  test("zA and the shifted lower-case za both fold every fenced block of the file", async () => {
    const { mounted, type, state, lineOf, keys } = await zApp()
    for (const shifted of [SHIFT_A, SHIFTED_LOWER_A]) {
      mounted.blockFolds.clear()
      mounted.show({ files: state().files })
      keys.jumpTo(lineOf("between", "doc.md"))
      type("z", shifted)
      expect(mounted.blockFolds.collapsed().size).toBe(1)
    }
  })

  test("a second zA unfolds the file's blocks once zA has folded them all", async () => {
    const { mounted, type, lineOf, keys } = await zApp()
    keys.jumpTo(lineOf("between", "doc.md"))
    type("z", SHIFT_A)
    expect(mounted.blockFolds.collapsed().size).toBe(1)
    expect(await mounted.frame()).not.toContain("+echo hello")

    type("z", SHIFT_A)
    expect(mounted.blockFolds.collapsed().size).toBe(0)
    const frame = await mounted.frame()
    expect(frame).toContain("~~~sh")
    expect(frame).toContain("echo hello")
  })

  test("za on a fence hides the block's lines, and a second za brings them back", async () => {
    const { mounted, type, lineOf, keys } = await zApp()
    keys.jumpTo(lineOf("~~~sh", "doc.md"))
    type("z", "a")
    expect(await mounted.frame()).not.toContain("echo hello")

    type("z", "a")
    expect(await mounted.frame()).toContain("echo hello")
  })

  test("zA folds the block za left open, then unfolds both", async () => {
    const { mounted, type, lineOf, keys } = await zApp({}, TWO_BLOCKS)
    keys.jumpTo(lineOf("~~~sh", "doc.md"))
    type("z", "a")
    expect(mounted.blockFolds.collapsed().size).toBe(1)

    keys.jumpTo(lineOf("between", "doc.md"))
    type("z", SHIFT_A)
    expect(mounted.blockFolds.collapsed().size).toBe(2)
    type("z", SHIFT_A)
    expect(mounted.blockFolds.collapsed().size).toBe(0)
  })

  test("zM keeps a block za folded before it", async () => {
    const { mounted, type, lineOf, keys } = await zApp({}, TWO_BLOCKS)
    keys.jumpTo(lineOf("~~~sh", "doc.md"))
    type("z", "a")
    const folded = [...mounted.blockFolds.collapsed()]

    type("z", "\x1b[77;2u")
    expect(mounted.blockFolds.collapsed().size).toBe(2)
    expect([...mounted.blockFolds.collapsed()]).toEqual(expect.arrayContaining(folded))
  })

  test("zM, zm and the shifted zm fold every file, zR, zr and the shifted zr unfold them", async () => {
    const { mounted, type } = await zApp()
    const everyFile = ["a.ts", "b.ts", "doc.md"]
    for (const [fold, unfold] of [
      ["\x1b[77;2u", "\x1b[82;2u"],
      ["m", "r"],
      ["\x1b[109;2u", "\x1b[114;2u"],
    ] as const) {
      type("z", fold)
      expect([...mounted.fileFolds.collapsed()].sort()).toEqual(everyFile)
      expect(mounted.blockFolds.collapsed().size).toBe(1)
      type("z", unfold)
      expect(mounted.fileFolds.collapsed().size).toBe(0)
      expect(mounted.blockFolds.collapsed().size).toBe(0)
    }
  })

  test("zc closes the fold at the cursor and zo opens it", async () => {
    const { mounted, type, lineOf, keys } = await zApp()
    keys.jumpTo(lineOf('  return "hello"'))
    type("z", "c")
    expect([...mounted.fileFolds.collapsed()]).toEqual(["a.ts"])
    type("z", "o")
    expect(mounted.fileFolds.collapsed().size).toBe(0)
  })
})

test("zw toggles wrapping", async () => {
  const { type } = await zApp()
  type("z", "w")
  expect(app!.diffOptions.wrapLines()).toBe(true)
  type("z", "w")
  expect(app!.diffOptions.wrapLines()).toBe(false)
})

test("zl and zh scroll a column, zL and zH half a window, zs and ze to the cursor's column", async () => {
  const { type, scrolls, viewport, keys, lineOf } = await zApp()
  keys.jumpTo(lineOf(WIDE))
  type("z", "l", "z", "h")
  const half = viewport.halfColumnWindow(keys.vimState().line)
  expect(half).toBeGreaterThan(1)
  type("z", "\x1b[76;2u", "z", "\x1b[72;2u", "z", "\x1b[108;2u")
  type("z", "s", "z", "e")
  expect(scrolls).toEqual([
    "columns 1",
    "columns -1",
    `columns ${half}`,
    `columns ${-half}`,
    `columns ${half}`,
    "column start",
    "column end",
  ])
})

test("in the feed, za opens the highlighted row", async () => {
  const { mounted, type } = await zApp()
  mounted.activityFeed.setEvents(FEED_EVENTS)
  mounted.show({
    appMode: "pr",
    viewMode: "feed",
  })
  await mounted.frame()
  type("z", "a")
  expect(mounted.activityFeed.expandedIds().size).toBe(1)
  expect(mounted.fileFolds.collapsed().size).toBe(0)
})

describe("a key that breaks off a sequence", () => {
  test("a lone z gives up after the chord timeout, so the next key is a key of its own", async () => {
    const { type, keys } = await zApp()
    type("z")
    expect(keys.chordPending()).toBe(true)
    await Bun.sleep(700)
    expect(keys.chordPending()).toBe(false)
    type("\\")
    expect(app!.diffOptions.splitView()).toBe(true)
  })

  // The bracket's timer would fire 500 ms after the ]; the z's own one,
  // armed by the same listener, holds it 500 ms after the z.
  test("]z holds the z for a chord timeout of its own", async () => {
    const { type, scrolls, keys } = await zApp()
    type("]")
    await Bun.sleep(250)
    type("z")
    await Bun.sleep(400)
    expect(keys.chordPending()).toBe(true)
    type("z")
    expect(scrolls).toEqual(["center"])
    expect(keys.chordPending()).toBe(false)
  })

  test("]z gives up a chord timeout after the z", async () => {
    const { type, keys } = await zApp()
    type("]")
    await Bun.sleep(250)
    type("z")
    await Bun.sleep(700)
    expect(keys.chordPending()).toBe(false)
  })

  test("zg then g goes to the top, the chain opening g", async () => {
    const { type, keys, lineOf } = await zApp()
    keys.jumpTo(lineOf('  return "hello"', "b.ts"))
    type("z", "g", "g")
    expect(keys.vimState().line).toBe(0)
    expect(keys.chordPending()).toBe(false)
  })

  test("gz then z centres, the z breaking off g and opening in the keymap", async () => {
    const { type, scrolls, keys } = await zApp()
    type("g", "z")
    expect(keys.chordPending()).toBe(true)
    type("z")
    expect(scrolls).toEqual(["center"])
  })

  test("z]f steps a file", async () => {
    const { type, cursorFile } = await zApp()
    expect(cursorFile()).toBe("a.ts")
    type("z", "]", "f")
    expect(cursorFile()).toBe("b.ts")
  })
})

test("mz sets mark z, the mark chord keeping the key", async () => {
  const { mounted, type, scrolls, keys, lineOf } = await zApp()
  keys.jumpTo(lineOf('  return "hello"'))
  type("m", "z")
  expect(mounted.marks.marks().map((mark) => mark.letter)).toEqual(["z"])
  expect(scrolls).toEqual([])
  expect(keys.chordPending()).toBe(false)
})

test("shift+z and a key named Z open no z sequence and reach the leftover", async () => {
  const harness = await keymapHarness()
  const ran: string[] = []
  registerChordStrokes(harness.riffKeymap.keymap, sequenceSuffixes(Z_SEQUENCES))
  registerZChordKeys(harness.riffKeymap, {
    getState: () => createInitialState([], [], "test", ""),
    cursorView: { scrollCursorTo: (_line: number, where: string) => void ran.push(where) },
    getVimState: () => ({ line: 0 }),
    render: () => {},
    linePeek: { open: () => false },
    blamePeek: { open: () => false },
  } as unknown as ZChordDeps)
  harness.press("\x1b[122;2u")
  expect(harness.riffKeymap.chordPending()).toBe(false)
  harness.press("z", "Z")
  expect(harness.riffKeymap.chordPending()).toBe(false)
  expect(harness.leftKeys).toEqual(["z", "Z"])
  harness.press("z")
  harness.press("z")
  expect(ran).toEqual(["center"])
})

describe("under a modal", () => {
  test("the help overlay holds z", async () => {
    const { mounted, type, scrolls, keys } = await zApp()
    mounted.help.toggle()
    mounted.show()
    type("z")
    expect(keys.chordPending()).toBe(false)
    type("z")
    expect(scrolls).toEqual([])
  })

  test("the line peek holds z", async () => {
    const { mounted, type, scrolls, keys } = await zApp()
    mounted.linePeek.toggle()
    mounted.show()
    type("z")
    expect(keys.chordPending()).toBe(false)
    type("z")
    expect(scrolls).toEqual([])
  })

  test("the search prompt holds z", async () => {
    const { type, scrolls, keys } = await zApp({ getSearchState: () => ({ ...createSearchState(), active: true }) })
    type("z")
    expect(keys.chordPending()).toBe(false)
    type("z")
    expect(scrolls).toEqual([])
  })

  test("the thread panel keeps za its own", async () => {
    const { mounted, type, scrolls, keys, state } = await zApp({
      threadPanelLayout: () => app!.ctx.threadPanel.layout(),
    })
    mounted.show({
      comments: [createComment("a.ts", 2, "open")],
    })
    mounted.show({
      ...openInlineCommentOverlay(state(), "a.ts", 2, "RIGHT", "view"),
      focusedPanel: "comments",
    })
    await mounted.frame()
    type("z")
    expect(keys.chordPending()).toBe(false)
    type("z", "z", "a")
    expect(scrolls).toEqual([])
    expect(mounted.fileFolds.collapsed().size).toBe(0)
    expect(state().inlineCommentOverlay.open).toBe(true)
  })

  test("the PR overview keeps za its own", async () => {
    setSystemTime(PR_NOW)
    let panel: PRInfoPanelClass | null = null
    const { mounted, type, scrolls, keys } = await zApp({ getPrInfoPanel: () => panel })
    const info = fullPr()
    panel = new PRInfoPanelClass(mounted.setup.renderer, info, mounted.ctx.getState().files, [], new Set(["description"]))
    try {
      mounted.setPrInfoPanel(panel)
      mounted.show({ appMode: "pr", prInfo: info, viewMode: "state" })
      expect(await mounted.frame()).toContain("▼  Description")
      type("z")
      expect(keys.chordPending()).toBe(false)
      type("a")
      expect(await mounted.frame()).toContain("▶  Description")
      expect(scrolls).toEqual([])
      expect(mounted.fileFolds.collapsed().size).toBe(0)
    } finally {
      panel?.destroy()
      setSystemTime()
    }
  })

  test("a z sequence a peek does not allow is swallowed", async () => {
    const { mounted, type, scrolls, keys } = await zApp()
    type("z")
    mounted.linePeek.toggle()
    mounted.show()
    type("z")
    expect(scrolls).toEqual([])
    expect(keys.chordPending()).toBe(false)
    expect(mounted.linePeek.open()).toBe(true)
  })
})

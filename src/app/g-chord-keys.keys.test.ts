import { afterEach, describe, expect, setSystemTime, spyOn, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import type { AppKeyContext } from "./key-context"
import { routeDiffViewport, type DiffViewport } from "./diff-viewport"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { PR_NOW } from "../testing/pr-info"
import { fullPr } from "../testing/pr-info-panel"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
import { openInlineCommentOverlay } from "../state"
import { createComment } from "../types"
import type { FoldsContext } from "../features/folds"
import type { BlameDeps } from "../features/blame/keys"
import { chordTimeoutMs } from "../features/marks/keys"
import type { SyncPreviewOpenContext } from "../features/sync-preview"

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

const SHIFT_G = "\x1b[71;2u"
const SHIFTED_LOWER_G = "\x1b[103;2u"
const SHIFT_C = "\x1b[67;2u"
const CTRL_R = "\x12"
const CTRL_P = "\x10"
const CTRL_G = "\x07"
const F12 = "\x1b[24~"

let app: Awaited<ReturnType<typeof mountApp>> | null = null
let live = false
afterEach(async () => {
  live = false
  await app?.dispose()
  app = null
})

/** Polls `done` until it holds, for a timeout that fires on its own; false if it never does. */
async function until(done: () => boolean, withinMs = 2000): Promise<boolean> {
  const start = Date.now()
  while (!done()) {
    if (Date.now() - start > withinMs) return false
    await Bun.sleep(10)
  }
  return true
}

/** riff's keys through the real createAppKeys, every scroll the chords ask of the diff recorded. */
async function gApp(more: Partial<AppKeyContext> = {}) {
  app = await mountApp(DIFF, { width: 120, height: 30 })
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
  live = true
  const syncPreviewOpenContext: SyncPreviewOpenContext = {
    getState: render.getState,
    // The toast clears itself 3 s later, long after the app is disposed.
    setState: (update) => live && render.setState(update),
    render: () => live && mounted.render(),
    toast: mounted.toast,
    syncPreview: mounted.syncPreview,
  }
  keys = keysOn(mounted, { cursorView, foldsContext, rebuildLineMapping, syncPreviewOpenContext, ...more })
  await mounted.frame()
  const press = (sequence: string) =>
    mounted.setup.renderer.keyInput.emit("keypress", new KeyEvent(parseKeypress(sequence, { useKittyKeyboard: true })!))
  const type = (...sequences: string[]) => sequences.forEach(press)
  const lineOf = (content: string, file = "a.ts") =>
    render.getLineMapping().allLines.findIndex((line) => line.content === content && line.filename === file)
  const cursorFile = () => render.getLineMapping().getLine(vim().line)?.filename
  const state = () => render.getState()
  const line = () => vim().line
  return { mounted, keys, type, scrolls, lineOf, cursorFile, state, line, linePeek: mounted.linePeek }
}

describe("the ends", () => {
  test("gg goes to the top", async () => {
    const { type, keys, lineOf, line } = await gApp()
    keys.jumpTo(lineOf('  return "hello"', "b.ts"))
    type("g", "g")
    expect(line()).toBe(0)
    expect(keys.chordPending()).toBe(false)
  })

  test("gG, in either spelling, goes to the bottom", async () => {
    const { mounted, type, keys, line } = await gApp()
    const last = mounted.ctx.getLineMapping().lineCount - 1
    for (const shifted of [SHIFT_G, SHIFTED_LOWER_G]) {
      keys.jumpTo(0)
      type("g", shifted)
      expect(line()).toBe(last)
      expect(keys.chordPending()).toBe(false)
    }
  })
})

test("g? opens the help, and g? under the help closes it", async () => {
  const { type, mounted } = await gApp()
  type("g", "?")
  expect(mounted.help.open()).toBe(true)
  type("g", "?")
  expect(mounted.help.open()).toBe(false)
})

test("gs asks for the sync preview", async () => {
  const { mounted, type } = await gApp()
  type("g", "s")
  expect(mounted.reviewPreview.open()).toBe(false)
  // Outside PR mode, as the harness is, the sync preview declines with a toast.
  expect(await mounted.frame()).toContain("Sync only available in PR mode")
})

test("gC opens the comments picker when there are comments", async () => {
  const { mounted, type } = await gApp()
  mounted.show({ comments: [createComment("a.ts", 2, "hi")] })
  type("g", SHIFT_C)
  expect(mounted.commentsPicker.open()).toBe(true)
})

describe("under the line peek", () => {
  test("gl closes it and gg is swallowed", async () => {
    const { type, keys, lineOf, line, linePeek } = await gApp()
    const at = lineOf('  return "hello"', "b.ts")
    keys.jumpTo(at)
    type("g", "l")
    expect(linePeek.open()).toBe(true)
    type("g", "g")
    expect(line()).toBe(at)
    expect(linePeek.open()).toBe(true)
    type("g", "l")
    expect(linePeek.open()).toBe(false)
  })

  test("g then j is swallowed, as the chain swallowed every chord the peek does not allow", async () => {
    const { type, keys, lineOf, line, linePeek } = await gApp()
    const at = lineOf('  return "hello"')
    keys.jumpTo(at)
    type("g", "l", "g", "j")
    expect(line()).toBe(at)
    expect(linePeek.open()).toBe(true)
    expect(keys.chordPending()).toBe(false)
  })

  test("g then Ctrl-r still opens the chat", async () => {
    const { mounted, type, state } = await gApp()
    type("g", "l", "g", CTRL_R)
    expect([mounted.chatColumnState.open(), state().focusedPanel]).toEqual([true, "chat"])
  })

  test("g then F12 still toggles the debug console, as the app layer ignores chords", async () => {
    const { mounted, type, keys, linePeek } = await gApp()
    type("g", "l")
    const toggle = spyOn(mounted.setup.renderer.console, "toggle").mockImplementation(() => {})
    type("g", F12)
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(linePeek.open()).toBe(true)
    expect(keys.chordPending()).toBe(false)
  })
})

test("under the blame peek gb and go act and every other g chord is swallowed", async () => {
  const opened: string[] = []
  const blame: BlameDeps = {
    source: {
      fileBlame: () => Promise.reject(new Error("the peek reads one line")),
      lineBlame: async () => ({
        line: {
          kind: "commit",
          commit: { sha: "a1b2c3d4e5f6", shortSha: "a1b2c3d4", author: "Ada", date: "2026-10-18T09:30:00Z", subject: "hello" },
        },
        pr: { number: 12, url: "https://github.com/o/r/pull/12" },
      }),
    },
    openUrl: (url) => void opened.push(url),
    copy: async () => ({ ok: true }),
    repoRef: async () => ({ owner: "o", repo: "r" }),
    splitRows: () => app!.ctx.split.splitRows(),
  }
  const { mounted, type, keys, lineOf, line, linePeek } = await gApp({ blame })
  const at = lineOf('  return "hello"', "b.ts")
  keys.jumpTo(at)
  type("g", "b")
  expect(await until(() => mounted.blamePeek.peek()?.status === "ready")).toBe(true)
  type("g", "g", "g", "l")
  expect(line()).toBe(at)
  expect(linePeek.open()).toBe(false)
  type("g", "o")
  expect(await until(() => opened.length > 0)).toBe(true)
  expect(opened).toEqual(["https://github.com/o/r/pull/12"])
  type("g", "b")
  expect(mounted.blamePeek.open()).toBe(false)
})

describe("a key that breaks off a g sequence", () => {
  test("Ctrl-r after a lone g opens the chat", async () => {
    const { mounted, type, state, keys } = await gApp()
    type("g", CTRL_R)
    expect([mounted.chatColumnState.open(), state().focusedPanel]).toEqual([true, "chat"])
    expect(keys.chordPending()).toBe(false)
  })

  test("j reaches the diff once the sequence breaks off", async () => {
    const { type, keys, line } = await gApp()
    keys.jumpTo(0)
    type("g", "j")
    expect(line()).toBe(1)
    expect(keys.chordPending()).toBe(false)
  })

  test("q does not quit and Ctrl-p opens no palette", async () => {
    const { mounted, type, keys } = await gApp()
    type("g", "q", "g", CTRL_P)
    expect(keys.quits).toEqual([])
    expect(mounted.actionMenu.open()).toBe(false)
  })

  test("\\ does not toggle the split view", async () => {
    const { type } = await gApp()
    type("g", "\\")
    expect(app!.diffOptions.splitView()).toBe(false)
  })

  test("g]f steps a file", async () => {
    const { type, cursorFile } = await gApp()
    expect(cursorFile()).toBe("a.ts")
    type("g", "]", "f")
    expect(cursorFile()).toBe("b.ts")
  })

  test("gzz centres", async () => {
    const { type, scrolls } = await gApp()
    type("g", "z", "z")
    expect(scrolls).toEqual(["center"])
  })

  test("z then g g goes to the top", async () => {
    const { type, keys, lineOf, line } = await gApp()
    keys.jumpTo(lineOf('  return "hello"', "b.ts"))
    type("z", "g", "g")
    expect(line()).toBe(0)
    expect(keys.chordPending()).toBe(false)
  })
})

// The help leaves a bare g, and stands aside while a chord is pending, so
// the key that breaks off g opens its own sequence behind the overlay.
describe("under the help", () => {
  test("g]f steps a file", async () => {
    const { mounted, type, cursorFile } = await gApp()
    mounted.help.toggle()
    mounted.show()
    type("g", "]", "f")
    expect(cursorFile()).toBe("b.ts")
    expect(mounted.help.open()).toBe(true)
  })

  test("gzz scrolls the diff", async () => {
    const { mounted, type, scrolls } = await gApp()
    mounted.help.toggle()
    mounted.show()
    type("g", "z", "z")
    expect(scrolls).toEqual(["center"])
    expect(mounted.help.open()).toBe(true)
  })
})

test("a lone g gives up after the chord timeout, so the next g opens a sequence of its own", async () => {
  const { type, keys, lineOf, line } = await gApp()
  const at = lineOf('  return "hello"', "b.ts")
  keys.jumpTo(at)
  type("g")
  await Bun.sleep(chordTimeoutMs("g")! - 100)
  expect(keys.chordPending()).toBe(true)
  expect(await until(() => !keys.chordPending(), 300)).toBe(true)
  type("g")
  expect(keys.chordPending()).toBe(true)
  expect(line()).toBe(at)
})

test("Ctrl-g still opens the commit picker", async () => {
  const { mounted, type, keys } = await gApp()
  mounted.show({ commits: [{ sha: "abc1234", message: "greet louder", author: "ana", date: "2026-01-01T00:00:00Z" }] })
  type(CTRL_G)
  expect(mounted.commitPicker.open()).toBe(true)
  expect(keys.chordPending()).toBe(false)
})

test("G with the tree focused goes to the tree's last row, a key named G too", async () => {
  const { mounted, type, state, keys } = await gApp()
  for (const bottom of [SHIFT_G, "G"]) {
    mounted.show({ focusedPanel: "tree", showFilePanel: true, treeHighlightIndex: 0 })
    type(bottom)
    expect(state().treeHighlightIndex).toBeGreaterThan(0)
    expect(keys.chordPending()).toBe(false)
  }
})

describe("panels with g chords of their own", () => {
  test("the thread panel keeps its g", async () => {
    const { mounted, type, keys, state, linePeek } = await gApp({
      threadPanelLayout: () => app!.ctx.threadPanel.layout(),
    })
    mounted.show({ comments: [createComment("a.ts", 2, "open")] })
    mounted.show({ ...openInlineCommentOverlay(state(), "a.ts", 2, "RIGHT", "view"), focusedPanel: "comments" })
    await mounted.frame()
    type("g")
    expect(keys.chordPending()).toBe(false)
    // The panel swallows a g chord it has no use for, so gl opens no peek.
    type("l")
    expect(linePeek.open()).toBe(false)
    expect(state().inlineCommentOverlay.open).toBe(true)
  })

  test("the thread panel's own gg goes to its first entry", async () => {
    const { mounted, type, keys, state } = await gApp({
      threadPanelLayout: () => app!.ctx.threadPanel.layout(),
      // The highlight brings the diff cursor along, which reads the files.
      fileNavContext: {
        getState: () => app!.ctx.getState(),
        setState: (update: Parameters<AppKeyContext["setState"]>[0]) => app!.ctx.setState(update),
        get fileFolds() {
          return app!.fileFolds
        },
        createLineMapping: () => {},
      } as unknown as AppKeyContext["fileNavContext"],
    })
    mounted.show({ comments: [createComment("a.ts", 2, "first"), createComment("a.ts", 2, "second")] })
    mounted.show({ ...openInlineCommentOverlay(state(), "a.ts", 2, "RIGHT", "view"), focusedPanel: "comments" })
    await mounted.frame()
    type(SHIFT_G)
    expect(state().inlineCommentOverlay.highlightedIndex).toBeGreaterThan(0)
    type("g", "g")
    expect(state().inlineCommentOverlay.highlightedIndex).toBe(0)
    expect(keys.chordPending()).toBe(false)
  })

  test("the PR overview keeps its g", async () => {
    setSystemTime(PR_NOW)
    let panel: PRInfoPanelClass | null = null
    const { mounted, type, keys, state, line } = await gApp({ getPrInfoPanel: () => panel })
    const info = fullPr()
    panel = new PRInfoPanelClass(mounted.setup.renderer, info, mounted.ctx.getState().files, [])
    try {
      mounted.setPrInfoPanel(panel)
      mounted.show({ appMode: "pr", prInfo: info, viewMode: "state" })
      await mounted.frame()
      keys.jumpTo(2)
      type("g")
      expect(keys.chordPending()).toBe(false)
      type("g")
      expect(line()).toBe(2)
      expect(state().viewMode).toBe("state")
    } finally {
      panel?.destroy()
      setSystemTime()
    }
  })
})

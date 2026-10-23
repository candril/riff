import { afterEach, describe, expect, setSystemTime, test } from "bun:test"
import { KeyEvent, parseKeypress } from "@opentui/core"
import type { AppKeyContext } from "./key-context"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { FEED_EVENTS } from "../testing/feed-keys"
import { pinStdoutColumns } from "../testing/frame"
import { PR_NOW } from "../testing/pr-info"
import { fullPr } from "../testing/pr-info-panel"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
import { createComment } from "../types"
import type { PrCommit } from "../providers/github/types"

const fileDiff = (name: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
@@ -20,3 +20,3 @@
 export function part() {
-  return "bye"
+  return "farewell"
 }
`

const DIFF = ["a.ts", "b.ts", "c.ts"].map(fileDiff).join("")

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** riff's keys through the real createAppKeys, with the contexts the bracket motions reach. */
async function bracketApp(more: Partial<AppKeyContext> = {}) {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  app.show({ focusedPanel: "diff" })
  const mounted = app
  const { ctx: render } = mounted
  const selected: (string | null)[] = []
  const marksReached: number[] = []
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
  } as unknown as AppKeyContext["fileNavContext"]
  keys = keysOn(mounted, {
    rebuildLineMapping,
    fileTreePanel: mounted.fileTreePanel,
    updateFileTreePanel: render.updateFileTreePanel,
    fileNavContext,
    threadMotionContext: {
      getState: render.getState,
      setState: render.setState,
      getVimState: vim,
      setVimState,
      getLineMapping: render.getLineMapping,
      ensureCursorVisible: () => {},
      render: mounted.render,
      fileNavContext,
      visit: mounted.visit,
    },
    marksContext: {
      getState: render.getState,
      setState: render.setState,
      marks: {
        snapshot: () => {
          marksReached.push(1)
          return mounted.marks.snapshot()
        },
      },
      render: mounted.render,
      toast: mounted.toast,
    } as unknown as AppKeyContext["marksContext"],
    onCommitSelected: (sha) => void selected.push(sha),
    ...more,
  })
  await mounted.frame()
  const press = (sequence: string) =>
    mounted.setup.renderer.keyInput.emit("keypress", new KeyEvent(parseKeypress(sequence, { useKittyKeyboard: true })!))
  const type = (...sequences: string[]) => sequences.forEach(press)
  const cursorFile = () => render.getLineMapping().getLine(vim().line)?.filename
  const state = () => render.getState()
  return { mounted, keys, type, cursorFile, state, selected, marksReached }
}

describe("file steps", () => {
  test("]f and [f move the cursor between file headers in the all-files view", async () => {
    const { type, cursorFile, keys } = await bracketApp()
    expect(cursorFile()).toBe("a.ts")
    type("]", "f")
    expect(cursorFile()).toBe("b.ts")
    type("]", "f")
    expect(cursorFile()).toBe("c.ts")
    type("[", "f")
    expect(cursorFile()).toBe("b.ts")
    expect(keys.chordPending()).toBe(false)
  })

  test("]f and [f step the selected file in the single-file view", async () => {
    const { mounted, type, state } = await bracketApp()
    mounted.show({ selectedFileIndex: 0 })
    type("]", "f")
    expect(state().selectedFileIndex).toBe(1)
    type("[", "f")
    expect(state().selectedFileIndex).toBe(0)
  })

  test("]F, a shifted second key, is no file step", async () => {
    const { type, cursorFile, keys } = await bracketApp()
    type("]", "F")
    expect(cursorFile()).toBe("a.ts")
    expect(keys.chordPending()).toBe(false)
  })

  test("] then Ctrl-f, and Ctrl-] then f, step a file as ]f does", async () => {
    const { type, cursorFile } = await bracketApp()
    type("]", "\x06")
    expect(cursorFile()).toBe("b.ts")
    type("\x1d", "f")
    expect(cursorFile()).toBe("c.ts")
  })

  test("]]f and g]f act as ]f, the second opener starting a sequence of its own", async () => {
    const { type, cursorFile, keys } = await bracketApp()
    type("]", "]")
    expect(keys.chordPending()).toBe(true)
    type("f")
    expect(cursorFile()).toBe("b.ts")
    type("g", "]", "f")
    expect(cursorFile()).toBe("c.ts")
    expect(keys.chordPending()).toBe(false)
  })
})

test("]c and [c move the cursor between hunks", async () => {
  const { type, keys } = await bracketApp()
  type("]", "c")
  const first = keys.vimState().line
  type("]", "c")
  const second = keys.vimState().line
  expect(second).toBeGreaterThan(first)
  type("[", "c")
  expect(keys.vimState().line).toBe(first)
})

test("]g past the last commit wraps to all commits", async () => {
  const { mounted, type, selected } = await bracketApp()
  const commits = [{ sha: "one" }, { sha: "two" }] as PrCommit[]
  mounted.show({ commits, viewingCommit: "one" })
  type("]", "g")
  expect(selected).toEqual(["two"])
  mounted.show({ viewingCommit: "two" })
  type("]", "g")
  expect(selected).toEqual(["two", null])
})

test("]R, with shift, steps past a resolved thread that ]r stops on", async () => {
  const { mounted, type, cursorFile } = await bracketApp()
  const resolved = { ...createComment("b.ts", 2, "done"), isThreadResolved: true }
  mounted.show({ comments: [resolved, createComment("c.ts", 2, "open")] })
  type("]", "\x1b[82;2u")
  expect(cursorFile()).toBe("c.ts")
  type("[", "r")
  expect(cursorFile()).toBe("b.ts")
})

test("]n steps to the thread with a comment newer than the visit's watermark, past one seen before it, and goes nowhere without a watermark", async () => {
  const { mounted, type, cursorFile } = await bracketApp()
  const old = { ...createComment("b.ts", 2, "read last time"), createdAt: "2026-01-01T00:00:00Z" }
  const fresh = { ...createComment("c.ts", 2, "arrived since"), createdAt: "2026-01-03T00:00:00Z" }
  mounted.show({ comments: [old, fresh] })
  type("]", "n")
  expect(cursorFile()).toBe("a.ts")
  mounted.visit.begin({ lastVisitAt: "2026-01-02T00:00:00Z", lastSeenHeadSha: "", seenCommentIds: [] }, false)
  type("]", "n")
  expect(cursorFile()).toBe("c.ts")
})

describe("a key that breaks off a sequence", () => {
  test("]j moves the diff cursor down one", async () => {
    const { type, keys } = await bracketApp()
    const from = keys.vimState().line
    type("]", "j")
    expect(keys.vimState().line).toBe(from + 1)
    expect(keys.chordPending()).toBe(false)
  })

  test("] then a backslash does not toggle the split view", async () => {
    const { type, state } = await bracketApp()
    type("]", "\\")
    expect(state().splitView).toBe(false)
  })

  test("a lone ] gives up after the chord timeout, so the next key is a key of its own", async () => {
    const { type, state, cursorFile, keys } = await bracketApp()
    type("]")
    expect(keys.chordPending()).toBe(true)
    await Bun.sleep(700)
    expect(keys.chordPending()).toBe(false)
    type("\\")
    expect(state().splitView).toBe(true)
    type("\\", "]")
    await Bun.sleep(700)
    type("f")
    expect(cursorFile()).toBe("a.ts")
  })

  test("with the tree focused, ] then j moves the tree's highlight", async () => {
    const { mounted, type, state } = await bracketApp()
    mounted.show({ focusedPanel: "tree", showFilePanel: true, treeHighlightIndex: 0 })
    type("]", "j")
    expect(state().treeHighlightIndex).toBe(1)
  })
})

test("in the feed, ]r steps to the next thread and leaves the feed's type filter alone", async () => {
  const { mounted, type, state, cursorFile } = await bracketApp()
  mounted.activityFeed.setEvents(FEED_EVENTS)
  mounted.show({
    appMode: "pr",
    viewMode: "feed",
    comments: [createComment("b.ts", 2, "open")],
  })
  await mounted.frame()
  type("]", "r")
  expect(mounted.activityFeed.types().size).toBe(0)
  expect(cursorFile()).toBe("b.ts")
})

test("vi] with the text object pending reaches the vim handler, not the bracket layer", async () => {
  const { type, keys, cursorFile } = await bracketApp()
  type("v", "i", "]")
  expect(keys.vimState().pendingTextObject).toBeNull()
  expect(keys.chordPending()).toBe(false)
  expect(cursorFile()).toBe("a.ts")
})

describe("]m", () => {
  test("steps through marks in the diff", async () => {
    const { mounted, type, marksReached } = await bracketApp()
    type("]", "m")
    expect(marksReached.length).toBeGreaterThan(0)
    expect(mounted.toast.current()?.message).toBe("No marks set")
  })

  test("outside the diff does nothing to marks", async () => {
    const { mounted, type, marksReached } = await bracketApp()
    mounted.show({ focusedPanel: "tree", showFilePanel: true, treeHighlightIndex: 0 })
    type("]", "m")
    expect(marksReached).toEqual([])
  })
})

test("with the PR overview open, Ctrl-] then f goes to the overview rather than stepping a file", async () => {
  setSystemTime(PR_NOW)
  const restoreColumns = pinStdoutColumns(120)
  let panel: PRInfoPanelClass | null = null
  const { mounted, type, cursorFile, keys } = await bracketApp({ getPrInfoPanel: () => panel })
  const info = fullPr()
  panel = new PRInfoPanelClass(mounted.setup.renderer, info, mounted.ctx.getState().files, [])
  try {
    mounted.setPrInfoPanel(panel)
    mounted.show({ appMode: "pr", prInfo: info, viewMode: "state" })
    await mounted.frame()
    type("\x1d", "f")
    expect(cursorFile()).toBe("a.ts")
    expect(keys.chordPending()).toBe(false)
  } finally {
    panel?.destroy()
    restoreColumns()
    setSystemTime()
  }
})

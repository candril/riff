import { afterEach, expect, test } from "bun:test"
import type { GlobalKeyContext } from "./global-keys"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn, openChat } from "../testing/chat-keys"
import { createFeedState, openInlineCommentOverlay, showToast, toggleHelp } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import type { Comment } from "../types"

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

const THREAD: Comment = {
  id: "c1",
  filename: "src/greet.ts",
  line: 2,
  side: "RIGHT",
  body: "why hello?",
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
  author: "ana",
}

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** riff's keys through the real createAppKeys, with what the global keys reach and nothing that spawns. */
async function globalApp(more: Partial<GlobalKeyContext> = {}) {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  app.show()
  const mounted = app
  const flashes: string[] = []
  const comments: number[] = []
  const keys = keysOn(mounted, {
    fileTreePanel: mounted.fileTreePanel,
    updateFileTreePanel: () => {},
    rebuildLineMapping: () => {},
    getCommentScope: () => mounted.ctx.split.commentScope(),
    flashHandler: {
      startList: (surface: string) => void flashes.push(surface),
    } as unknown as GlobalKeyContext["flashHandler"],
    // handleAddComment reads the state first and stops with no files, before any editor.
    commentsContext: {
      getState: () => {
        comments.push(1)
        return { files: [] }
      },
    } as unknown as GlobalKeyContext["commentsContext"],
    ...more,
  })
  await mounted.frame()
  const state = () => mounted.ctx.getState()
  return { mounted, keys, state, flashes, comments }
}

test("Ctrl-p, Ctrl-f, Ctrl-k and Ctrl-g open the palette and the file, marks and commit pickers", async () => {
  const { mounted, state } = await globalApp()
  ctrl(mounted, "p")
  expect(state().actionMenu.open).toBe(true)

  mounted.show({ actionMenu: { ...state().actionMenu, open: false } })
  ctrl(mounted, "f")
  expect(state().filePicker.open).toBe(true)

  mounted.show({ filePicker: { ...state().filePicker, open: false } })
  ctrl(mounted, "k")
  expect(state().marksPicker.open).toBe(true)

  mounted.show({
    marksPicker: { ...state().marksPicker, open: false },
    commits: [{ sha: "abc1234", message: "greet louder", author: "ana", date: "2026-01-01T00:00:00Z" }],
  })
  ctrl(mounted, "g")
  expect(state().commitPicker.open).toBe(true)
})

test("Ctrl-Shift-p still opens the palette, and q and Shift-q quit", async () => {
  const { mounted, keys, state } = await globalApp()
  mounted.setup.mockInput.pressKey("p", { ctrl: true, shift: true })
  expect(state().actionMenu.open).toBe(true)

  mounted.show({ actionMenu: { ...state().actionMenu, open: false } })
  mounted.setup.mockInput.pressKey("q")
  mounted.setup.mockInput.pressKey("q", { shift: true })
  expect(keys.quits).toHaveLength(2)
})

test("Shift-c hands the line to $EDITOR's comment flow", async () => {
  const { mounted, comments } = await globalApp()
  mounted.setup.mockInput.pressKey("c", { shift: true })
  expect(comments).toHaveLength(1)
})

test("i, a and d switch between the overview, the feed and the diff", async () => {
  const { mounted, state } = await globalApp()
  mounted.show({ appMode: "pr", feed: { ...createFeedState(), events: [{ id: "e", type: "comment", at: "2026-01-01T00:00:00Z", title: "hi" }] } })
  mounted.setup.mockInput.pressKey("a")
  expect(state().viewMode).toBe("feed")
  mounted.setup.mockInput.pressKey("d")
  expect(state().viewMode).toBe("diff")
  mounted.setup.mockInput.pressKey("i")
  expect(state().viewMode).toBe("state")
})

test("in diff visual mode i opens a text object rather than switching views", async () => {
  const { mounted, keys, state } = await globalApp()
  mounted.show({ appMode: "pr" })
  await mounted.setup.mockInput.typeText("vi")
  expect(keys.vimState().pendingTextObject).not.toBeNull()
  expect(state().viewMode).toBe("diff")
})

test("with g pending, i completes the gi chord rather than switching views", async () => {
  const { mounted, keys, state } = await globalApp()
  mounted.show({ appMode: "pr" })
  await mounted.setup.mockInput.typeText("gi")
  expect(keys.chordPending()).toBe(false)
  expect(state().viewMode).toBe("diff")
})

test("with a text object pending, s goes to the text object, not to flash", async () => {
  const { mounted, keys, flashes, state } = await globalApp()
  await mounted.setup.mockInput.typeText("vis")
  expect(keys.vimState().pendingTextObject).toBeNull()
  expect(flashes).toEqual([])
  expect(state().occurrencePicker.open).toBe(false)
})

test("Ctrl-b hides and shows the tree, and showing it focuses it", async () => {
  const { mounted, state } = await globalApp()
  const shown = state().showFilePanel
  ctrl(mounted, "b")
  expect(state().showFilePanel).toBe(!shown)
  if (!shown) expect(state().focusedPanel).toBe("tree")
  ctrl(mounted, "b")
  expect(state().showFilePanel).toBe(shown)
  if (shown) expect(state().focusedPanel).toBe("tree")
})

test("Ctrl-l moves focus right and backspace back left", async () => {
  const { mounted, state } = await globalApp()
  mounted.show({ showFilePanel: true, focusedPanel: "tree" })
  ctrl(mounted, "l")
  expect(state().focusedPanel).toBe("diff")
  mounted.setup.mockInput.pressBackspace()
  expect(state().focusedPanel).toBe("tree")
})

test("Esc clears a toast", async () => {
  const { mounted, state } = await globalApp()
  mounted.show({ toast: showToast(state(), "saved").toast })
  mounted.setup.mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  expect(state().toast.message).toBeFalsy()
})

test("Ctrl-o walks back through the jumplist and Tab forward again", async () => {
  const { mounted, keys } = await globalApp()
  const at = (line: number) => ({ fileIndex: null, filename: null, viewingCommit: null, viewMode: "diff" as const, cursorLine: line, cursorCol: 0 })
  keys.setVim({ ...createCursorState(), line: 3 })
  mounted.show({ jumpList: { entries: [at(1), at(5)], index: 1 } })
  ctrl(mounted, "o")
  expect(keys.vimState().line).toBe(5)
  mounted.setup.mockInput.pressTab()
  expect(keys.vimState().line).toBe(3)
})

test("a bare s in the tree starts flash on its rows, and Ctrl-s opens the occurrence picker", async () => {
  const { mounted, state, flashes } = await globalApp()
  mounted.show({ showFilePanel: true, focusedPanel: "tree" })
  mounted.setup.mockInput.pressKey("s")
  expect(flashes).toEqual(["tree"])

  mounted.show({ focusedPanel: "diff" })
  ctrl(mounted, "s")
  expect(state().occurrencePicker.open).toBe(true)
})

test("Ctrl-t opens the thread panel on the cursor's file", async () => {
  const { mounted, state } = await globalApp()
  mounted.show({ comments: [THREAD] })
  ctrl(mounted, "t")
  expect(state().inlineCommentOverlay.open).toBe(true)
  expect(state().inlineCommentOverlay.mode).toBe("view")
})

test("with the help overlay up, q closes the help and does not quit", async () => {
  const { mounted, keys, state } = await globalApp()
  mounted.show(toggleHelp(state()))
  mounted.setup.mockInput.pressKey("q")
  expect(state().showHelp).toBe(false)
  expect(keys.quits).toEqual([])
})

test("with the thread panel in view mode, Ctrl-p still opens the palette", async () => {
  const { mounted, state } = await globalApp({ threadPanelLayout: () => app!.ctx.threadPanel.layout() })
  mounted.show({
    ...openInlineCommentOverlay(state(), "src/greet.ts", 2, "RIGHT", "view"),
    comments: [THREAD],
    focusedPanel: "comments",
  })
  ctrl(mounted, "p")
  expect(state().actionMenu.open).toBe(true)
})

test("in the chat, Ctrl-l is the chat's own key and focus stays there", async () => {
  const { mounted, state } = await globalApp()
  openChat(mounted)
  expect(state().focusedPanel).toBe("chat")
  ctrl(mounted, "l")
  expect(state().focusedPanel).toBe("chat")
})

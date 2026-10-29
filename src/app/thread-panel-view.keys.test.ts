import { afterEach, expect, test } from "bun:test"
import type { AppKeyContext } from "./key-context"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn } from "../testing/chat-keys"
import { composerTextareaIn } from "../testing/composer"
import { composerColumns, composerRows } from "../components/thread-rows-estimate"
import { threadPanelGeometry } from "./thread-panel-geometry"
import { getInlineCommentOverlayDisplayOrder, openInlineCommentOverlay } from "../state"
import type { Comment } from "../types"

const FILE = `diff --git a/src/greet.ts b/src/greet.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/src/greet.ts
@@ -0,0 +1,10 @@
${Array.from({ length: 10 }, (_, i) => `+export const line${i + 1} = ${i + 1}`).join("\n")}
`

const comment = (id: string, line: number, author: string): Comment => ({
  id,
  filename: "src/greet.ts",
  line,
  side: "RIGHT",
  body: `${author} on line ${line}`,
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
  author,
})

const THREADS = [comment("c1", 2, "ana"), comment("c2", 6, "bo"), comment("c3", 9, "cy")]

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** riff with the thread panel open and focused, its keys through the real createAppKeys. */
async function panelApp(size = { width: 160, height: 30 }, comments = THREADS) {
  app = await mountApp(FILE, size)
  app.show({ comments, selectedFileIndex: 0 })
  const mounted = app
  const flashes: { surface: string; ids: string[] }[] = []
  const keys = keysOn(mounted, {
    threadPanelLayout: () => mounted.ctx.threadPanel.layout(),
    fileNavContext: {
      getState: mounted.ctx.getState,
      setState: mounted.ctx.setState,
      fileFolds: mounted.fileFolds,
      createLineMapping: () => {},
    } as unknown as AppKeyContext["fileNavContext"],
    flashHandler: {
      startList: (surface: string, ids: string[]) => void flashes.push({ surface, ids }),
    } as unknown as AppKeyContext["flashHandler"],
  })
  mounted.show({
    ...openInlineCommentOverlay(mounted.ctx.getState(), "src/greet.ts", 2, "RIGHT", "view"),
    focusedPanel: "comments",
  })
  await mounted.frame()
  return { mounted, keys, flashes }
}

const highlighted = () => {
  const state = app!.ctx.getState()
  return getInlineCommentOverlayDisplayOrder(state)[state.inlineCommentOverlay.highlightedIndex]!
}

test("j moves the highlight to the next thread, the diff cursor follows, and the panel draws the caret on it", async () => {
  const { mounted, keys } = await panelApp()
  expect(highlighted().id).toBe("c1")

  mounted.setup.mockInput.pressKey("j")
  expect(highlighted().id).toBe("c2")
  expect(keys.vimState().line).toBe(mounted.ctx.getLineMapping().findLineForComment(highlighted())!)

  const lines = (await mounted.frame()).split("\n")
  const caret = lines.findIndex((line) => line.includes("▸ @bo"))
  expect(caret).toBeGreaterThan(-1)
  expect(lines[caret + 1]).toContain("bo on line 6")
  expect(lines.some((line) => line.includes("▸ @ana"))).toBe(false)
})

test("Ctrl-r from the focused panel opens the chat, and with the chat open Ctrl-l steps into it", async () => {
  const { mounted } = await panelApp()
  ctrl(mounted, "r")
  expect(mounted.chatColumnState.open()).toBe(true)
  expect(mounted.ctx.getState().focusedPanel).toBe("chat")
  expect(mounted.ctx.getState().inlineCommentOverlay.mode).toBe("view")

  mounted.show({ focusedPanel: "comments" })
  ctrl(mounted, "l")
  expect(mounted.ctx.getState().focusedPanel).toBe("chat")
})

test("Ctrl-p opens the palette over the panel", async () => {
  const { mounted } = await panelApp()
  ctrl(mounted, "p")
  expect(mounted.actionMenu.open()).toBe(true)
  expect(mounted.ctx.getState().inlineCommentOverlay.open).toBe(true)
})

test("a bare s starts flash labels on the panel's comments", async () => {
  const { mounted, flashes } = await panelApp()
  mounted.setup.mockInput.pressKey("s")
  expect(flashes).toHaveLength(1)
  expect(flashes[0]!.surface).toBe("comments")
  expect(flashes[0]!.ids).toEqual(["c1", "c2", "c3"])
})

test("below two long threads, j keeps the highlighted thread on screen", async () => {
  const long = (id: string, line: number, author: string): Comment => ({
    ...comment(id, line, author),
    body: `${author} opens ` + "a single paragraph that wraps across many rows of the panel ".repeat(12),
  })
  const comments = [long("l1", 2, "ana"), long("l2", 4, "bo"), comment("c3", 6, "cy"), comment("c4", 9, "di")]
  const { mounted } = await panelApp({ width: 120, height: 24 }, comments)
  mounted.setup.mockInput.pressKey("j")
  mounted.setup.mockInput.pressKey("j")
  expect(highlighted().id).toBe("c3")

  const frame = await mounted.frame()
  expect(frame).toContain("▸ @cy")
  expect(frame).toContain("cy on line 6")
})

test("at 120x24, G on five ordinary threads draws the last one and the two above it", async () => {
  const authors = ["ana", "bo", "cy", "di", "ed"]
  const comments = authors.map((author, i) => comment(`c${i + 1}`, 1 + i * 2, author))
  const { mounted } = await panelApp({ width: 120, height: 24 }, comments)
  mounted.setup.mockInput.pressKey("G")
  expect(highlighted().id).toBe("c5")

  const frame = await mounted.frame()
  expect(frame).toContain("▸ @ed")
  expect(frame).toContain("@cy")
  expect(frame).toContain("@di")
  expect(frame).not.toContain("@bo")
})

test("at 120x24, replying to the last of five threads with a twelve-line draft draws its author and the composer, and counts no thread below it", async () => {
  const authors = ["ana", "bo", "cy", "di", "ed"]
  const comments = authors.map((author, i) => comment(`c${i + 1}`, 1 + i * 2, author))
  const { mounted } = await panelApp({ width: 120, height: 24 }, comments)
  mounted.setup.mockInput.pressKey("G")
  mounted.setup.mockInput.pressKey("r")
  await mounted.frame()
  expect(mounted.ctx.getState().inlineCommentOverlay.mode).toBe("compose")
  const draft = Array.from({ length: 12 }, (_, i) => `draft line ${i + 1}`)
  mounted.ctx.threadPanel.composer.setValue(draft.join("\n"))
  await mounted.frame()

  const frame = await mounted.frame()
  expect(frame).toContain("@ed")
  expect(frame).toContain("Reply @ greet.ts:9")
  expect(frame).toContain("draft line 12")
  expect(frame).not.toContain("1 more")
  expect(frame.split("\n").some((line) => line.trimEnd().endsWith("  ↓"))).toBe(true)
})

test("at 120x24, with threads still to come below a long highlighted thread, the bottom edge counts them", async () => {
  const long = (id: string, line: number, author: string): Comment => ({
    ...comment(id, line, author),
    body: `${author} opens ` + "a single paragraph that wraps across many rows of the panel ".repeat(12),
  })
  const comments = [long("l1", 2, "ana"), comment("c2", 6, "bo"), comment("c3", 9, "cy")]
  const { mounted } = await panelApp({ width: 120, height: 24 }, comments)
  expect(highlighted().id).toBe("l1")

  const frame = await mounted.frame()
  expect(frame).toContain("▸ @ana")
  expect(frame).toContain("↓ 2 more")
  expect(frame).not.toContain("@cy")
})

test("at 120x24, a draft whose words wrap to more rows than its characters would is counted as drawn, and keeps the author on screen", async () => {
  const authors = ["ana", "bo", "cy", "di", "ed"]
  const comments = authors.map((author, i) => comment(`c${i + 1}`, 1 + i * 2, author))
  const size = { width: 120, height: 24 }
  const { mounted } = await panelApp(size, comments)
  mounted.setup.mockInput.pressKey("G")
  mounted.setup.mockInput.pressKey("r")
  await mounted.frame()
  const { width } = threadPanelGeometry(mounted.ctx.getState(), { open: false, expanded: false }, size, () => "")
  // Three words a little over half the textarea's columns: a row each by word, two rows by character.
  const word = (letter: string) => letter.repeat(Math.floor(composerColumns(width) / 2) + 1)
  const draft = ["a", "b", "c"].map((letter) => [word(letter), word(letter), word(letter)].join(" ")).join("\n")
  mounted.ctx.threadPanel.composer.setValue(draft)
  await mounted.frame()

  const frame = await mounted.frame()
  const textarea = composerTextareaIn(mounted.ctx.threadPanel.host)
  expect(textarea.virtualLineCount).toBe(9)
  expect(composerRows(draft, width)).toBe(3 + textarea.virtualLineCount)
  expect(frame).toContain("@ed")
  expect(frame).toContain("Reply @ greet.ts:9")
})

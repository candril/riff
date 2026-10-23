import { afterEach, expect, test } from "bun:test"
import type { AppKeyContext } from "./key-context"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn } from "../testing/chat-keys"
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
async function panelApp() {
  app = await mountApp(FILE, { width: 160, height: 30 })
  app.show({ comments: THREADS, selectedFileIndex: 0 })
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
  expect(mounted.ctx.getState().chatOpen).toBe(true)
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

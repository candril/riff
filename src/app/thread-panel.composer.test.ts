import { afterEach, expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import type { ThreadPanelInput } from "../components/thread-panel-model"
import type { CommentsContext } from "../features/comments"
import { openInlineCommentOverlay, startInlineCompose } from "../state"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { composerTextareaIn } from "../testing/composer"
import { trimFrame } from "../testing/frame"
import { createThreadPanelIsland } from "./thread-panel"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
`

let teardown: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of teardown) await dispose()
  teardown = []
})

function composing(width: number): ThreadPanelInput & { now: number } {
  return {
    comments: [],
    scopeFilename: "src/greet.ts",
    composeFilename: "src/greet.ts",
    line: 2,
    replyToThread: false,
    note: false,
    mode: "compose",
    appMode: "local",
    highlightedIndex: 0,
    editingId: null,
    draft: "",
    focused: true,
    expanded: false,
    width,
    viewportRows: 0,
    mentionPicker: null,
    emojiPicker: null,
    mentionCandidates: [],
    mentionSearchQuery: null,
    expandedThreadIds: new Set(),
    unseenIds: new Set(),
    filter: "",
    filterInput: false,
    openOnly: null,
    flashLabels: new Map(),
    now: Date.now(),
  }
}

async function panelOnItsOwnRenderer() {
  const setup = await createTestRenderer({ width: 48, height: 20 })
  teardown.push(async () => {
    await setup.waitForVisualIdle().catch(() => {})
    setup.renderer.destroy()
  })
  const island = createThreadPanelIsland(setup.renderer)
  setup.renderer.root.add(island.host)
  const frame = async () => {
    await setup.renderOnce()
    await setup.renderOnce()
    return trimFrame(setup.captureCharFrame())
  }
  return { setup, island, frame }
}

test("each island types into its own textarea, whichever renderer was built last", async () => {
  const a = await panelOnItsOwnRenderer()
  const b = await panelOnItsOwnRenderer()

  a.island.compose({ key: "a", initialValue: "", mode: "compose" })
  a.island.update(composing(48))
  await a.setup.mockInput.typeText("typed into A")

  expect(a.island.composer.value()).toBe("typed into A")
  expect(b.island.composer.value()).toBe("")
  expect(a.setup.renderer.currentFocusedRenderable).toBe(composerTextareaIn(a.island.host))
  expect(await a.frame()).toContain("typed into A")

  b.island.compose({ key: "b", initialValue: "seeded in B", mode: "compose" })
  b.island.update(composing(48))
  expect(await b.frame()).toContain("seeded in B")
  expect(a.island.composer.value()).toBe("typed into A")
  expect(await a.frame()).not.toContain("seeded in B")
})

test("typing in the composer draws what is typed with the terminal cursor showing, and Esc hides the cursor again", async () => {
  const app = await mountApp(DIFF, { width: 120, height: 24 })
  teardown.push(() => app.dispose())
  keysOn(app, { commentsContext: { getCachedCurrentUser: () => null } as unknown as CommentsContext })
  app.show(openInlineCommentOverlay(app.ctx.getState(), "src/greet.ts", 2, "RIGHT", "view"))
  app.show({ focusedPanel: "comments" })
  await app.frame()
  expect(app.setup.renderer.getCursorState().visible).toBe(false)

  app.show(startInlineCompose(app.ctx.getState()))
  await app.setup.mockInput.typeText("a thought")
  const frame = await app.frame()
  expect(frame).toContain("a thought")
  const cursor = app.setup.renderer.getCursorState()
  expect(cursor.visible).toBe(true)
  expect(cursor.style).toBe("block")
  const row = frame.split("\n")[cursor.y - 1]!
  expect(row.indexOf("a thought") + "a thought".length).toBe(cursor.x - 1)

  app.setup.mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  await app.frame()
  expect(app.ctx.getState().inlineCommentOverlay.mode).toBe("view")
  expect(app.setup.renderer.getCursorState().visible).toBe(false)
})

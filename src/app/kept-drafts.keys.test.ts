import { afterEach, describe, expect, test } from "bun:test"
import type { CommentsContext } from "../features/comments"
import { adoptReloadedState } from "../features/refresh/handlers"
import { createInitialState } from "../state"
import { mountApp, reloadCtx } from "../testing/app-render"
import { keysOn, moveTo } from "../testing/chat-keys"
import { composerTextareaIn } from "../testing/composer"
import { PANEL_COMMENTS, panelState, threadPanelKeys } from "../testing/thread-panel-keys"

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

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

async function composerOnHello() {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  const mounted = app
  const keys = keysOn(mounted, {
    getCommentScope: mounted.ctx.split.commentScope,
    commentsContext: { getCachedCurrentUser: () => null } as unknown as CommentsContext,
  })
  await mounted.frame()
  moveTo(mounted, keys.vimState, '  return "hello"')
  const openComposer = async () => {
    mounted.setup.mockInput.pressKey("c")
    await mounted.frame()
    expect(mounted.ctx.getState().inlineCommentOverlay.mode).toBe("compose")
  }
  const dismiss = async () => {
    mounted.setup.mockInput.pressEscape()
    // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
    await Bun.sleep(50)
    return mounted.frame()
  }
  const cursorContent = () => mounted.ctx.getLineMapping().getLine(keys.vimState().line)?.content
  return { mounted, openComposer, dismiss, cursorContent }
}

test("Esc keeps the composer's text for its line, and `n` there brings it back", async () => {
  const { mounted, openComposer, dismiss } = await composerOnHello()
  await openComposer()
  await mounted.setup.mockInput.typeText("half a thought")

  const dismissed = await dismiss()
  expect(mounted.ctx.getState().inlineCommentOverlay.mode).toBe("view")
  expect(dismissed).toContain("Draft kept for this line")
  expect(dismissed).toContain("n draft")

  mounted.setup.mockInput.pressKey("n")
  await Bun.sleep(10)
  const reopened = await mounted.frame()
  expect(mounted.ctx.getState().inlineCommentOverlay.mode).toBe("compose")
  expect(composerTextareaIn(mounted.ctx.threadPanel.host).plainText).toBe("half a thought")
  expect(reopened).toContain("half a thought")
})

// A draft is keyed by file, line and side, and a reload can move what sits
// on that line, so the kept drafts go with the rest of the reloaded state.
test("a reload drops the kept drafts: the line's composer opens empty", async () => {
  const { mounted, openComposer, dismiss, cursorContent } = await composerOnHello()
  await openComposer()
  await mounted.setup.mockInput.typeText("half a thought")
  expect(await dismiss()).toContain("n draft")

  adoptReloadedState(reloadCtx(mounted), (prev) => createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"))
  mounted.render()
  await mounted.frame()
  expect(cursorContent()).toBe('  return "hello"')

  await openComposer()
  await Bun.sleep(10)
  expect(composerTextareaIn(mounted.ctx.threadPanel.host).plainText).toBe("")
  expect(await mounted.frame()).not.toContain("half a thought")
  const dismissed = await dismiss()
  expect(dismissed).toContain("n new")
  expect(dismissed).not.toContain("n draft")
})

describe("the thread panel picks a kept draft back up", () => {
  test("e on a comment opens the rewrite kept for it, not its body", async () => {
    const keys = await threadPanelKeys(panelState(0))
    keys.commentDrafts.remember({ editingId: "a" }, "a better way to say it")
    keys.press("e")
    expect(keys.overlay().mode).toBe("edit")
    expect(keys.overlay().editingId).toBe("a")
    expect(keys.overlay().input).toBe("a better way to say it")
  })

  test("e on another comment opens that comment's own text, not the rewrite kept for the first", async () => {
    const keys = await threadPanelKeys(panelState(2))
    keys.commentDrafts.remember({ editingId: "a" }, "a better way to say it")
    keys.press("e")
    expect(keys.overlay().editingId).toBe("b")
    expect(keys.overlay().input).toBe("about line 3")

    const edited = await threadPanelKeys(panelState(2, {
      comments: PANEL_COMMENTS.map((c) => c.id === "b" ? { ...c, localEdit: "b, reworded" } : c),
    }))
    edited.commentDrafts.remember({ editingId: "a" }, "a better way to say it")
    edited.press("e")
    expect(edited.overlay().input).toBe("b, reworded")
  })

  // The panel was opened on src/greet.ts, line 0, right side; the highlighted
  // comment differs in all three, so a reply anchored on the panel's own line
  // would land there. Its draft is the one kept for its thread, not either line's.
  test("r on a comment answers its thread on that comment's file, line and side, with the draft kept for that thread", async () => {
    const keys = await threadPanelKeys(panelState(2, {
      comments: PANEL_COMMENTS.map((c) => c.id === "b" ? { ...c, filename: "src/part.ts", side: "LEFT" as const } : c),
    }))
    const panel = keys.overlay()
    expect({ filename: panel.filename, line: panel.line, side: panel.side }).toEqual({ filename: "src/greet.ts", line: 0, side: "RIGHT" })
    keys.commentDrafts.remember({ filename: panel.filename, line: panel.line, side: panel.side }, "the panel's own line")
    keys.commentDrafts.remember({ filename: "src/part.ts", line: 3, side: "LEFT" }, "a new comment in progress")
    keys.commentDrafts.remember({ replyTo: "a" }, "a reply to another thread")
    keys.commentDrafts.remember({ replyTo: "b" }, "a reply in progress")
    keys.press("r")
    expect(keys.overlay().mode).toBe("compose")
    expect(keys.overlay().replyTo).toBe("b")
    const { filename, line, side } = keys.overlay()
    expect({ filename, line, side }).toEqual({ filename: "src/part.ts", line: 3, side: "LEFT" })
    expect(keys.overlay().input).toBe("a reply in progress")
  })
})

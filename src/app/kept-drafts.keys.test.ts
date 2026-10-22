import { afterEach, expect, test } from "bun:test"
import type { CommentsContext } from "../features/comments"
import { adoptReloadedState } from "../features/refresh/handlers"
import { createInitialState } from "../state"
import { mountApp, reloadCtx } from "../testing/app-render"
import { keysOn, moveTo } from "../testing/chat-keys"
import { composerTextareaIn } from "../testing/composer"

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
    commentsContext: { source: "test", getCachedCurrentUser: () => null } as unknown as CommentsContext,
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

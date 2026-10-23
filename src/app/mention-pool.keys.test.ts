import { afterEach, expect, test } from "bun:test"
import type { CommentsContext } from "../features/comments"
import { adoptReloadedState } from "../features/refresh/handlers"
import { createInitialState } from "../state"
import { mountApp, reloadCtx } from "../testing/app-render"
import { keysOn, moveTo } from "../testing/chat-keys"

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

test("the fetched @mention pool outlives a reload: `@da` still offers its login", async () => {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  const mounted = app
  const keys = keysOn(mounted, {
    getCommentScope: mounted.ctx.split.commentScope,
    commentsContext: { getCachedCurrentUser: () => null } as unknown as CommentsContext,
  })
  mounted.mentions.merge(["dana"])
  mounted.render()
  await mounted.frame()

  adoptReloadedState(reloadCtx(mounted), (prev) => createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"))
  mounted.render()
  await mounted.frame()

  moveTo(mounted, keys.vimState, '  return "hello"')
  mounted.setup.mockInput.pressKey("c")
  await mounted.frame()
  expect(mounted.ctx.getState().inlineCommentOverlay.mode).toBe("compose")
  await mounted.setup.mockInput.typeText("ask @da")

  expect(mounted.ctx.getState().inlineCommentOverlay.mentionPicker?.query).toBe("da")
  expect(await mounted.frame()).toContain("@dana")
})

import { afterEach, expect, test } from "bun:test"
import type { CommentsContext } from "../features/comments"
import { startInlineEdit } from "../state"
import type { Comment } from "../types"
import { mountApp } from "../testing/app-render"
import { keysOn, moveTo } from "../testing/chat-keys"
import { composerTextareaIn } from "../testing/composer"

// Seeding the composer with "ask @al" opens no mention picker inside the
// pass that seeds it, so no nested pass publishes: the textarea reports the
// seeding a tick later, outside any pass.

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

const MENTIONING: Comment = {
  id: "c1",
  filename: "src/greet.ts",
  line: 2,
  side: "RIGHT",
  body: "ask @al",
  createdAt: "2026-01-01T00:00:00Z",
  status: "local",
  author: "ana",
}

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

test("editing a comment whose body ends in a mention seeds the composer without a nested publish", async () => {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  const mounted = app
  const keys = keysOn(mounted, {
    getCommentScope: mounted.ctx.split.commentScope,
    commentsContext: { source: "test", getCachedCurrentUser: () => null } as unknown as CommentsContext,
  })
  mounted.mentions.merge(["alma"])
  mounted.show({ comments: [MENTIONING] })
  await mounted.frame()
  moveTo(mounted, keys.vimState, '  return "hello"')
  mounted.setup.mockInput.pressKey("c")
  await mounted.frame()
  expect(mounted.ctx.getState().inlineCommentOverlay.mode).toBe("compose")

  expect(() => mounted.show(startInlineEdit(mounted.ctx.getState(), "c1", "ask @al"))).not.toThrow()
  // The textarea reports the seeding a tick later, outside any pass.
  await Bun.sleep(10)
  const frame = await mounted.frame()
  expect(frame).toContain("(editing)")
  expect(frame).toContain("Editing comment")
  expect(frame).not.toContain("@alma")
  expect(mounted.ctx.getState().inlineCommentOverlay.mentionPicker).toBeNull()
  const textarea = composerTextareaIn(mounted.ctx.threadPanel.host)
  expect(textarea.plainText).toBe("ask @al")
  expect(mounted.ctx.getState().inlineCommentOverlay.mode).toBe("edit")
})

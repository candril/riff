import { afterEach, expect, test } from "bun:test"
import type { CommentsContext } from "../features/comments"
import { mountApp } from "../testing/app-render"
import { keysOn, moveTo } from "../testing/chat-keys"
import { composerTextareaIn } from "../testing/composer"

// The composer's triggers ride on the textarea's own content and cursor
// events, so these type through the real textarea rather than call the
// session: the props CommentComposer wires are what is under test.

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

/** riff with the composer opened by `c` on the changed line. */
async function composing() {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  const mounted = app
  const keys = keysOn(mounted, {
    getCommentScope: mounted.ctx.split.commentScope,
    commentsContext: { getCachedCurrentUser: () => null } as unknown as CommentsContext,
  })
  await mounted.frame()
  moveTo(mounted, keys.vimState, '  return "hello"')
  mounted.setup.mockInput.pressKey("c")
  await mounted.frame()
  expect(mounted.ctx.getState().inlineCommentOverlay.mode).toBe("compose")
  const textarea = composerTextareaIn(mounted.ctx.threadPanel.host)
  return { app: mounted, textarea }
}

test("`:smil` opens the emoji picker, and Tab puts the emoji in its place", async () => {
  const { app, textarea } = await composing()
  await app.setup.mockInput.typeText("hi :smil")

  expect(app.composerPickers.emoji()?.query).toBe("smil")
  const frame = await app.frame()
  expect(frame).toMatch(/😃 +:smiley:/)
  expect(frame).toContain("Tab/⏎ accept")

  app.setup.mockInput.pressTab()
  await app.frame()
  expect(textarea.plainText).toBe("hi 😄 ")
  expect(app.composerPickers.emoji()).toBeNull()
})

test("`@da` opens the mention picker on a known login, and Tab completes it", async () => {
  const { app, textarea } = await composing()
  app.mentions.merge(["dana"])
  await app.setup.mockInput.typeText("ask @da")

  expect(app.composerPickers.mention()?.query).toBe("da")
  expect(await app.frame()).toContain("@dana")

  app.setup.mockInput.pressTab()
  await app.frame()
  expect(textarea.plainText).toBe("ask @dana ")
  expect(app.composerPickers.mention()).toBeNull()
})

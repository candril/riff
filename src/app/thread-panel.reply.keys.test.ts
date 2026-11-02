import { afterEach, expect, spyOn, test } from "bun:test"
import type { CommentsContext } from "../features/comments"
import type { AppKeyContext } from "./key-context"
import { openInlineCommentOverlay } from "../state"
import * as storage from "../storage/comments"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { twoThreadsOn } from "../testing/two-threads"

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

// Saving writes the comment under .riff/; a test has no business there.
const saveComment = spyOn(storage, "saveComment").mockResolvedValue()

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
  saveComment.mockClear()
})

// isomorph#12103: two threads on one line, and `r` on the older one.
test("r on the older of two threads on a line saves the reply into that thread and draws it there", async () => {
  app = await mountApp(DIFF, { width: 140, height: 30 })
  const mounted = app
  // j/k move the diff's cursor along with the highlight, which expands the comment's file.
  const fileNavContext = {
    getState: mounted.ctx.getState,
    setState: mounted.ctx.setState,
    fileFolds: mounted.fileFolds,
    createLineMapping: () => mounted.show({ files: mounted.ctx.getState().files }),
  } as unknown as AppKeyContext["fileNavContext"]
  keysOn(mounted, {
    fileNavContext,
    commentsContext: { getCachedCurrentUser: () => null } as unknown as CommentsContext,
  })
  mounted.show({ comments: twoThreadsOn("src/greet.ts", 2) })
  mounted.show(openInlineCommentOverlay(mounted.ctx.getState(), "src/greet.ts", 2, "RIGHT", "view"))
  mounted.show({ focusedPanel: "comments" })
  await mounted.frame()

  mounted.setup.mockInput.pressKey("j")
  mounted.setup.mockInput.pressKey("j")
  mounted.setup.mockInput.pressKey("k")
  await mounted.frame()
  const ov = mounted.ctx.getState().inlineCommentOverlay
  expect(ov.highlightedIndex).toBe(1)

  mounted.setup.mockInput.pressKey("r")
  await mounted.frame()
  expect(mounted.ctx.getState().inlineCommentOverlay.mode).toBe("compose")
  await mounted.setup.mockInput.typeText("my reply")
  mounted.setup.mockInput.pressEnter()
  await Bun.sleep(10)
  const frame = await mounted.frame()

  const reply = mounted.ctx.getState().comments.find((c) => c.body === "my reply")
  expect(reply?.inReplyTo).toBe("older")
  const at = (text: string) => frame.indexOf(text)
  expect(at("older reply")).toBeGreaterThan(at("older thread"))
  expect(at("my reply")).toBeGreaterThan(at("older reply"))
  expect(at("newer thread")).toBeGreaterThan(at("my reply"))
})

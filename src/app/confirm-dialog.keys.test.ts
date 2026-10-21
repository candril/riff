import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { openInlineCommentOverlay, showConfirmDialog } from "../state"
import type { Comment } from "../types"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"

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

const COMMENT: Comment = {
  id: "c1",
  filename: "src/greet.ts",
  line: 2,
  side: "RIGHT",
  body: "say hello properly",
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
  author: "ana",
}

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  mock.restore()
  await app?.dispose()
  app = null
})

// The thread panel reads `y` as "copy a link" and `n` as "new comment";
// keysOn throws for both, since neither is in its ctx, and the renderer
// reports a handler's throw on console.error rather than rethrowing it.
test("y and n answer the dialog over the thread panel, which never sees them", async () => {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  const mounted = app
  keysOn(mounted)
  mounted.show({ comments: [COMMENT] })
  mounted.show({
    ...openInlineCommentOverlay(mounted.ctx.getState(), "src/greet.ts", 2, "RIGHT", "view"),
    focusedPanel: "comments",
  })
  await mounted.frame()
  const leaks = spyOn(console, "error").mockImplementation(() => {})
  const answers: string[] = []
  const ask = () =>
    mounted.ctx.setState((s) =>
      showConfirmDialog(s, {
        title: "Delete comment?",
        message: "Gone.",
        onConfirm: () => {
          answers.push("yes")
          mounted.ctx.setState((s) => ({ ...s, confirmDialog: null }))
        },
        onCancel: () => {
          answers.push("no")
          mounted.ctx.setState((s) => ({ ...s, confirmDialog: null }))
        },
      }),
    )

  ask()
  mounted.setup.mockInput.pressKey("y")
  expect(answers).toEqual(["yes"])

  ask()
  mounted.setup.mockInput.pressKey("n")
  expect(answers).toEqual(["yes", "no"])
  expect(mounted.ctx.getState().focusedPanel).toBe("comments")
  expect(mounted.ctx.getState().inlineCommentOverlay.mode).toBe("view")
  expect(leaks).not.toHaveBeenCalled()

  mounted.setup.mockInput.pressKey("y")
  expect(String(leaks.mock.calls[0]?.[1])).toContain("ctx.handleCopyCommentLink")
})

import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { openInlineCommentOverlay } from "../state"
import type { Comment } from "../types"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { prInfo } from "../testing/pr-info"
import type { AppKeyContext } from "./key-context"

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
    mounted.confirm.show({
      title: "Delete comment?",
      message: "Gone.",
      onConfirm: () => {
        answers.push("yes")
        mounted.confirm.close()
      },
      onCancel: () => {
        answers.push("no")
        mounted.confirm.close()
      },
    })

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

test("d on a synced comment asks before deleting it on GitHub; n leaves it, and nothing moves while it asks", async () => {
  app = await mountApp(DIFF, { width: 120, height: 24 })
  const mounted = app
  const synced: Comment = { ...COMMENT, githubId: 101 }
  const reply: Comment = { ...COMMENT, id: "c2", body: "and a reply", githubId: 102, inReplyTo: "c1" }
  // A PR review's comments context; `n` is the only answer given, so GitHub is never reached.
  const keys = keysOn(mounted, {
    commentsContext: {
      getState: mounted.ctx.getState,
      setState: mounted.ctx.setState,
      render: mounted.render,
      source: "gh:octo/riff#7",
      mode: "pr",
      prInfo: prInfo("body"),
      confirm: mounted.confirm,
    } as unknown as AppKeyContext["commentsContext"],
  })
  mounted.show({ comments: [synced, reply] })
  mounted.show({
    ...openInlineCommentOverlay(mounted.ctx.getState(), "src/greet.ts", 2, "RIGHT", "view"),
    focusedPanel: "comments",
  })
  await mounted.frame()
  const leaks = spyOn(console, "error").mockImplementation(() => {})
  const highlighted = () => mounted.ctx.getState().inlineCommentOverlay.highlightedIndex
  const line = keys.vimState().line

  mounted.setup.mockInput.pressKey("d")
  expect(await mounted.frame()).toContain("Delete Comment")
  expect(mounted.confirm.dialog()?.title).toBe("Delete Comment")

  mounted.setup.mockInput.pressKey("j")
  expect([keys.vimState().line, highlighted()]).toEqual([line, 0])
  expect(await mounted.frame()).toContain("Delete Comment")

  mounted.setup.mockInput.pressKey("n")
  const after = await mounted.frame()
  expect(after).not.toContain("Delete Comment")
  expect(mounted.confirm.dialog()).toBeNull()
  expect(mounted.ctx.getState().comments.map((c) => c.id)).toEqual(["c1", "c2"])
  expect(after).toContain("say hello properly")
  expect(leaks).not.toHaveBeenCalled()

  // The same j, with the dialog gone, reaches the panel; following the
  // highlight into the diff needs a context this harness leaves out.
  mounted.setup.mockInput.pressKey("j")
  expect(highlighted()).toBe(1)
})

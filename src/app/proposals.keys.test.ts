import { afterEach, expect, spyOn, test } from "bun:test"
import * as comments from "../storage/comments"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import type { CommentsContext } from "../features/comments"
import { createComment, type Comment } from "../types"
import { DROPPED, createProposals } from "./proposals"

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

const TEXT = "Say hello to the caller by name."

// Saving writes the comment under .riff/; a test has no business there.
const saveComment = spyOn(comments, "saveComment").mockResolvedValue()

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
  saveComment.mockClear()
})

// riff's proposals on the test app, wired as app.ts wires them, and the composer's keys reporting to them.
async function proposing(comments: Comment[] = []) {
  app = await mountApp(DIFF, { width: 140, height: 24 })
  app.show({ comments })
  const mounted = app
  let jumpTo = (_line: number) => {}
  const proposals = createProposals({
    getState: mounted.ctx.getState,
    setState: mounted.ctx.setState,
    render: mounted.render,
    reveal: (anchor) => {
      const line = mounted.ctx.getLineMapping().findLineForComment(anchor)
      if (line !== null) jumpTo(line)
    },
    fillComposer: (text) => mounted.ctx.threadPanel.composer.setValue(text),
    note: mounted.chat.note,
    commentDrafts: mounted.commentDrafts,
  })
  const keys = keysOn(mounted, {
    composerSettled: proposals.composerSettled,
    commentsContext: { source: "test", getCachedCurrentUser: () => null } as unknown as CommentsContext,
  })
  jumpTo = keys.jumpTo
  // As the propose tools' handlers call it.
  const outcome =
    comments.length > 0
      ? proposals.proposeEdit(comments[0]!.id, TEXT)
      : proposals.proposeComment({ path: "src/greet.ts", line: 2, side: "new", text: TEXT })
  return { app: mounted, outcome, keys }
}

test("the agent's comment opens in the thread panel's composer on its line, the reviewer goes on typing, and Enter saves it", async () => {
  const { app, outcome, keys } = await proposing()
  const frame = await app.frame()
  expect(frame).toContain(TEXT)
  expect(frame).toContain("New comment @ greet.ts:2")
  const state = app.ctx.getState()
  expect([state.inlineCommentOverlay.mode, state.focusedPanel]).toEqual(["compose", "comments"])
  expect(app.ctx.getLineMapping().getLine(keys.vimState().line)?.content).toContain('return "hello"')
  expect(app.ctx.threadPanel.composer.cursorOffset()).toBe(TEXT.length)

  await app.setup.mockInput.typeText(" Thanks!")
  app.setup.mockInput.pressEnter()
  const kept = `${TEXT} Thanks!`
  expect(await outcome).toBe(`The reviewer saved it as a local comment on src/greet.ts:2: ${kept}`)
  const saved = app.ctx.getState().comments
  expect(saved.map((c) => [c.filename, c.line, c.side, c.body])).toEqual([["src/greet.ts", 2, "RIGHT", kept]])
  expect(saveComment).toHaveBeenCalledTimes(1)
})

test("Esc drops the agent's comment, and the line keeps no draft of it", async () => {
  const { app, outcome } = await proposing()
  await app.frame()
  app.setup.mockInput.pressEscape()
  expect(await outcome).toBe(DROPPED)
  expect(app.ctx.getState().comments).toEqual([])
  expect(app.commentDrafts.drafts().size).toBe(0)
  expect(app.ctx.getState().toast.message).toBeNull()
})

test("the agent's new wording opens the reviewer's comment in edit mode, and Enter saves it", async () => {
  const mine = { ...createComment("src/greet.ts", 2, "Greet them properly.", "RIGHT", "@you"), id: "local-1" }
  const { app, outcome } = await proposing([mine])
  const frame = await app.frame()
  expect(frame).toContain(TEXT)
  // The comment as it stands, marked as the one being edited, and the composer under it.
  expect(frame).toContain("@you now [local] (editing)")
  expect(frame).toContain("Greet them properly.")
  expect(frame).toContain("Editing comment")
  const ov = app.ctx.getState().inlineCommentOverlay
  expect([ov.mode, ov.editingId]).toEqual(["edit", "local-1"])
  expect(app.ctx.threadPanel.composer.cursorOffset()).toBe(TEXT.length)

  app.setup.mockInput.pressEnter()
  expect(await outcome).toBe(`The reviewer saved the new wording on src/greet.ts:2: ${TEXT}`)
  expect(app.ctx.getState().comments.map((c) => c.body)).toEqual([TEXT])
})

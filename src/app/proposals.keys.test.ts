import { afterEach, expect, spyOn, test } from "bun:test"
import * as storage from "../storage"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { readComposerCursorOffset, setComposerValue } from "../components/CommentComposer"
import type { CommentsContext } from "../features/comments"
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
const saveComment = spyOn(storage, "saveComment").mockResolvedValue()

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
  saveComment.mockClear()
})

// riff's proposals on the test app, wired as app.ts wires them, and the composer's keys reporting to them.
async function proposing() {
  app = await mountApp(DIFF, { width: 140, height: 24 })
  app.show()
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
    fillComposer: setComposerValue,
    note: mounted.ctx.chat.note,
  })
  const keys = keysOn(mounted, {
    composerSettled: proposals.composerSettled,
    commentsContext: { source: "test", getCachedCurrentUser: () => null } as unknown as CommentsContext,
  })
  jumpTo = keys.jumpTo
  // As the propose_comment handler calls it.
  const outcome = proposals.proposeComment({ path: "src/greet.ts", line: 2, side: "new", text: TEXT })
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
  expect(readComposerCursorOffset()).toBe(TEXT.length)

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
  expect(app.ctx.getState().commentDrafts.size).toBe(0)
  expect(app.ctx.getState().toast.message).toBeNull()
})

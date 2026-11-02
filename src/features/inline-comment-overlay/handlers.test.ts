import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { diffFile } from "../../diff-rows/fixtures"
import { createInitialState, openInlineCommentOverlay, setInlineCommentInput, type AppState } from "../../state"
import * as storage from "../../storage/comments"
import { twoThreadsOn } from "../../testing/two-threads"
import { createToastState } from "../toast/state"
import { submitInlineDraft } from "./handlers"

// Saving writes the comment under .riff/; a test has no business there.
const saveComment = spyOn(storage, "saveComment").mockResolvedValue()
afterEach(() => saveComment.mockClear())

const file = diffFile("s.ts", ["@@ -1,2 +1,2 @@", " a", "-b", "+B"])

function replying(replyTo: string | undefined) {
  const base: AppState = { ...createInitialState([file], [], "test", ""), comments: twoThreadsOn("s.ts", 2) }
  let state = setInlineCommentInput(openInlineCommentOverlay(base, "s.ts", 2, "RIGHT", "compose", undefined, replyTo), "my reply")
  const toast = createToastState()
  const ctx = {
    getState: () => state,
    setState: (update: (s: AppState) => AppState) => void (state = update(state)),
    render: () => {},
    toast,
    getCachedCurrentUser: () => null,
    commentDrafts: { forget: () => {} },
    composerPickers: { clear: () => {} },
  }
  return { ctx, toast, state: () => state }
}

describe("submitInlineDraft on a line with two threads", () => {
  test("a reply asked on the older thread joins the older thread's root", async () => {
    const saved = await submitInlineDraft(replying("older").ctx)
    expect(saved?.inReplyTo).toBe("older")
  })

  test("a reply asked on the newer thread joins the newer thread's root, not its last reply", async () => {
    const saved = await submitInlineDraft(replying("newer").ctx)
    expect(saved?.inReplyTo).toBe("newer")
  })

  test("a reply whose thread is gone becomes a thread of its own, and says so", async () => {
    const h = replying("deleted-meanwhile")
    const saved = await submitInlineDraft(h.ctx)
    expect(saved?.inReplyTo).toBeUndefined()
    expect(h.state().comments.find((c) => c.id === saved?.id)?.inReplyTo).toBeUndefined()
    expect(h.toast.current()?.message).toBe("That thread is gone — saved as a new thread")
  })

  test("a new comment on the line starts a thread, whatever threads are there", async () => {
    const saved = await submitInlineDraft(replying(undefined).ctx)
    expect(saved?.inReplyTo).toBeUndefined()
  })
})

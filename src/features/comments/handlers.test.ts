import { describe, expect, test } from "bun:test"
import { commentScope } from "../../diff-rows/comment-scope"
import { diffFile } from "../../diff-rows/fixtures"
import { createInitialState, type AppState } from "../../state"
import { createComment, type Comment } from "../../types"
import { buildCommentFileContent } from "../../utils/editor/comment-template"
import type { openCommentEditor } from "../../utils/editor/spawn"
import { createCursorState } from "../../vim-diff/cursor-state"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { twoThreadsOn } from "../../testing/two-threads"
import { handleAddComment, type CommentsContext } from "./handlers"

const file = diffFile("s.ts", ["@@ -1,2 +1,2 @@", " a", "-b", "+B"])
const mapping = new DiffLineMapping([file], "all")
const cursor = { ...createCursorState(), line: mapping.allLines.findIndex((line) => line.content === "B") }

const LOCAL = "local"
const PR = "gh:owner/repo#7"

/** An editor the test closes by hand, so a review switch can land while it is open. */
function heldEditor() {
  let close!: (edit: (buffer: string) => string) => void
  const closed = new Promise<(buffer: string) => string>((resolve) => (close = resolve))
  let opened!: () => void
  const isOpen = new Promise<void>((resolve) => (opened = resolve))
  let given: Parameters<typeof openCommentEditor>[0] | null = null
  const openEditor = async (options: Parameters<typeof openCommentEditor>[0]) => {
    given = options
    opened()
    return (await closed)(buildCommentFileContent(options))
  }
  return { openEditor, close, isOpen, given: () => given }
}

function harness(comments: Comment[]) {
  let state: AppState = { ...createInitialState([file], [], LOCAL, ""), comments }
  const persisted: { comment: Comment; source: string }[] = []
  const toasts: string[] = []
  const editor = heldEditor()
  const ctx = {
    getState: () => state,
    setState: (update: (s: AppState) => AppState) => (state = update(state)),
    getVimState: () => cursor,
    setVimState: () => {},
    getLineMapping: () => mapping,
    getCommentScope: () => commentScope(cursor, null),
    render: () => {},
    toast: { show: (message: string) => toasts.push(message), clear: () => {} },
    suspendRenderer: () => {},
    resumeRenderer: () => {},
    getCachedCurrentUser: () => null,
    setCachedCurrentUser: () => {},
    openEditor: editor.openEditor,
    persist: async (comment: Comment, source: string) => void persisted.push({ comment, source }),
  } as unknown as CommentsContext
  return {
    ctx,
    editor,
    persisted,
    toasts,
    state: () => state,
    switchTo: (source: string) => (state = { ...createInitialState([file], [], source, ""), appMode: "pr" }),
  }
}

describe("handleAddComment", () => {
  test("a comment written while riff switched to another review is saved under the review it was written in", async () => {
    const earlier = createComment(file.filename, 2, "first take", "RIGHT", "@you")
    const h = harness([earlier])
    const adding = handleAddComment(h.ctx)
    await h.editor.isOpen
    h.switchTo(PR)
    h.editor.close((buffer) => "looks wrong" + buffer.replace("first take", "second take"))
    await adding

    expect(h.persisted.map(({ comment, source }) => [comment.body, source])).toEqual([
      ["second take", LOCAL],
      ["looks wrong", LOCAL],
    ])
    expect(h.state().source).toBe(PR)
    expect(h.state().comments).toEqual([])
    expect(h.toasts).toHaveLength(1)
  })

  test("a comment written in the review still open joins it and is saved under it", async () => {
    const h = harness([])
    const adding = handleAddComment(h.ctx)
    await h.editor.isOpen
    h.editor.close((buffer) => "looks wrong" + buffer)
    await adding

    expect(h.persisted.map(({ comment, source }) => [comment.body, source])).toEqual([["looks wrong", LOCAL]])
    expect(h.state().comments.map((c) => c.body)).toEqual(["looks wrong"])
    expect(h.toasts).toEqual([])
  })
})

describe("handleAddComment replying to one of two threads on the line", () => {
  test("the editor is handed that thread alone, and the reply joins its root", async () => {
    const h = harness(twoThreadsOn(file.filename, 2))
    const adding = handleAddComment(h.ctx, { replyTo: "older" })
    await h.editor.isOpen
    expect(h.editor.given()?.thread?.map((c) => c.id)).toEqual(["older", "older-reply"])
    h.editor.close((buffer) => "my reply" + buffer)
    await adding

    const reply = h.state().comments.find((c) => c.body === "my reply")
    expect(reply?.inReplyTo).toBe("older")
  })

  test("without a thread to answer, `C` from the diff starts a thread of its own", async () => {
    const h = harness(twoThreadsOn(file.filename, 2))
    const adding = handleAddComment(h.ctx)
    await h.editor.isOpen
    h.editor.close((buffer) => "my comment" + buffer)
    await adding

    expect(h.state().comments.find((c) => c.body === "my comment")?.inReplyTo).toBeUndefined()
  })
})

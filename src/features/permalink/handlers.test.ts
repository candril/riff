import { test, expect } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { createCursorState } from "../../vim-diff/cursor-state"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { commentScope } from "../../diff-rows/comment-scope"
import { diffFile } from "../../diff-rows/fixtures"
import { prInfo } from "../../testing/pr-info"
import { handleCopyCommentLink, type PermalinkContext } from "./handlers"

test("after riff swaps a local review for its branch's pull request, a comment link is asked of that pull request", async () => {
  const file = diffFile("s.ts", ["@@ -1,1 +1,1 @@", "-a", "+b"])
  const mapping = new DiffLineMapping([file], "all")
  const vimState = createCursorState()
  let state: AppState = createInitialState([file], [], "local", "local changes")
  const toasts: string[] = []
  const ctx: PermalinkContext = {
    getState: () => state,
    setState: (fn) => {
      state = fn(state)
    },
    getVimState: () => vimState,
    getLineMapping: () => mapping,
    getCommentScope: () => commentScope(vimState, null),
    render: () => {},
    toast: { show: (message) => void toasts.push(message), clear: () => {} },
    getHeadSha: () => "",
  }

  await handleCopyCommentLink(ctx)
  state = { ...state, appMode: "pr", prInfo: prInfo("", { owner: "o", repo: "r", number: 7 }), source: "gh:o/r#7" }
  await handleCopyCommentLink(ctx)

  expect(toasts).toEqual(["Not reviewing a PR", "No comment here — move to a thread first"])
})

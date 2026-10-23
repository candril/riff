import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { createToastState } from "../toast/state"
import { prInfo } from "../../testing/pr-info"
import type { submitPrComment } from "../../providers/github/mutations"
import { createPrCommentInputState } from "./comment-input-state"
import { createPrInfoFilterState } from "./filter-state"
import type { PRInfoPanelDeps } from "./actions"
import { submitComment } from "./comment-input"

type SubmitResult = Awaited<ReturnType<typeof submitPrComment>>

function prompt(text: string, result: SubmitResult = { success: true }) {
  let state: AppState = { ...createInitialState([], [], "gh:owner/repo#1259", ""), appMode: "pr", prInfo: prInfo("") }
  const commentInput = createPrCommentInputState()
  commentInput.open()
  commentInput.setText(text)
  const toast = createToastState()
  const posted: unknown[][] = []
  const deps: PRInfoPanelDeps = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render: () => {},
    toast,
    commentInput,
    prInfoFilter: createPrInfoFilterState(),
    getPanel: () => null,
  }
  const post = async (...args: Parameters<typeof submitPrComment>) => {
    posted.push(args)
    return result
  }
  return { submit: () => submitComment(deps, post), commentInput, toast, posted }
}

// The post resolves at once, so one turn of the event loop runs its .then.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("the PR overview's comment prompt", () => {
  test("blank text is not posted and the prompt does not start loading", async () => {
    for (const text of ["", "   \n "]) {
      const h = prompt(text)
      h.submit()
      await settle()
      expect(h.posted).toEqual([])
      expect(h.commentInput.current()).toMatchObject({ open: true, loading: false })
    }
  })

  test("posted text goes trimmed to the PR, and the prompt closes once GitHub has it", async () => {
    const h = prompt("  Looks good.\n")
    h.submit()
    expect(h.commentInput.current().loading).toBe(true)
    await settle()
    expect(h.posted).toEqual([["owner", "repo", 1259, "Looks good."]])
    expect(h.commentInput.isOpen()).toBe(false)
    expect(h.toast.current()).toMatchObject({ message: "Comment posted", type: "success" })
  })

  test("a comment GitHub refuses keeps the prompt open with what it said", async () => {
    const h = prompt("Looks good.", { success: false, error: "nope" })
    h.submit()
    await settle()
    expect(h.commentInput.current()).toMatchObject({ open: true, text: "Looks good.", error: "nope" })
    expect(h.toast.current()).toBeNull()
  })

  test("a refusal with no reason says the comment failed to post", async () => {
    const h = prompt("Looks good.", { success: false })
    h.submit()
    await settle()
    expect(h.commentInput.current()).toMatchObject({ open: true, error: "Failed to post comment" })
  })
})

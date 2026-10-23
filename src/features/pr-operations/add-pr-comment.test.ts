import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { createToastState } from "../toast/state"
import { prInfo } from "../../testing/pr-info"
import { handleAddPrComment, type AddPrCommentSources } from "./add-pr-comment"

function commenter(sources: Partial<AddPrCommentSources> = {}) {
  const state: AppState = { ...createInitialState([], [], "gh:owner/repo#1259", ""), appMode: "pr", prInfo: prInfo("") }
  const terminal: string[] = []
  const later: { ms: number }[] = []
  const submitted: unknown[][] = []
  const toast = createToastState()
  const ctx = {
    sources: {
      openPrCommentEditor: async () => "Looks good.",
      submitPrComment: async (...args: unknown[]) => {
        submitted.push(args)
        return { success: true }
      },
      ...sources,
    } as AddPrCommentSources,
    getState: () => state,
    suspend: () => { terminal.push("suspend") },
    resume: () => { terminal.push("resume") },
    later: (_fn: () => void, ms: number) => { later.push({ ms }) },
    render: () => {},
    toast,
  }
  return { post: () => handleAddPrComment(ctx), toast, terminal, later, submitted }
}

describe("posting a PR comment from the editor", () => {
  test("a comment the reader leaves empty is not posted", async () => {
    const h = commenter({ openPrCommentEditor: async () => null })
    await h.post()
    expect(h.submitted).toEqual([])
    expect(h.terminal).toEqual(["suspend", "resume"])
    expect(h.toast.current()).toBeNull()
  })

  test("a written comment goes to the PR's conversation, and says so", async () => {
    const h = commenter()
    await h.post()
    expect(h.submitted).toEqual([["owner", "repo", 1259, "Looks good."]])
    expect(h.toast.current()).toMatchObject({ message: "Comment posted", type: "success" })
    expect(h.later).toEqual([{ ms: 2000 }])
  })

  test("a comment GitHub refuses says why", async () => {
    const h = commenter({ submitPrComment: async () => ({ success: false, error: "locked" }) })
    await h.post()
    expect(h.toast.current()).toMatchObject({ message: "Error: locked", type: "error" })
    expect(h.later).toEqual([{ ms: 3000 }])
  })

  test("an editor that fails gives the terminal back once, and says why", async () => {
    const h = commenter({ openPrCommentEditor: async () => { throw new Error("no $EDITOR") } })
    await h.post()
    expect(h.terminal).toEqual(["suspend", "resume"])
    expect(h.submitted).toEqual([])
    expect(h.toast.current()).toMatchObject({ message: "Error: no $EDITOR", type: "error" })
    expect(h.later).toEqual([{ ms: 3000 }])
  })
})

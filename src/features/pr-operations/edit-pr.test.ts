import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { parseDiff, sortFiles } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { createToastState } from "../toast/state"
import { prInfo } from "../../testing/pr-info"
import { THREE_TOP_LEVEL_FILES } from "../../testing/refresh-harness"
import { handleEditPr, type EditPrSources } from "./edit-pr"

const PR_BODY = "Why it is needed."

function editor(sources: Partial<EditPrSources> = {}, mode: "pr" | "local" = "pr") {
  const files = sortFiles(parseDiff(THREE_TOP_LEVEL_FILES))
  const initial = createInitialState(files, buildFileTree(files), "gh:owner/repo#1259", "", null, null, [], mode, mode === "pr" ? prInfo(PR_BODY) : null)
  let state: AppState = initial
  const calls: string[] = []
  const terminal: string[] = []
  const later: { ms: number }[] = []
  const edited: unknown[][] = []
  const toast = createToastState()
  const ctx = {
    sources: {
      getPrDiff: async () => { calls.push("getPrDiff"); return "diff --git a/a.ts b/a.ts" },
      openPrEditor: async () => { calls.push("openPrEditor"); return { title: "New title", body: "New body" } },
      editPullRequest: async (...args: unknown[]) => { edited.push(args) },
      ...sources,
    } as EditPrSources,
    getState: () => state,
    setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
    suspend: () => { terminal.push("suspend") },
    resume: () => { terminal.push("resume") },
    later: (_fn: () => void, ms: number) => { later.push({ ms }) },
    render: () => {},
    toast,
  }
  return {
    edit: () => handleEditPr(ctx),
    state: () => state,
    setState: ctx.setState,
    toast,
    calls,
    terminal,
    later,
    edited,
  }
}

describe("editing the pull request", () => {
  test("a local review has no PR to edit, so nothing is asked for", async () => {
    const h = editor({}, "local")
    await h.edit()
    expect(h.calls).toEqual([])
    expect(h.terminal).toEqual([])
    expect(h.toast.current()).toBeNull()
  })

  test("a PR the reader backs out of goes nowhere and changes nothing", async () => {
    const h = editor({ openPrEditor: async () => null })
    const before = h.state()
    await h.edit()
    expect(h.edited).toEqual([])
    expect(h.terminal).toEqual(["suspend", "resume"])
    expect(h.state()).toBe(before)
  })

  test("a title and body left as they were go nowhere, and say so", async () => {
    const h = editor({ openPrEditor: async () => ({ title: prInfo("").title, body: PR_BODY }) })
    await h.edit()
    expect(h.edited).toEqual([])
    expect(h.toast.current()).toMatchObject({ message: "No changes made", type: "info" })
    expect(h.later).toEqual([{ ms: 2000 }])
  })

  test("a changed title and body go to GitHub and into the PR riff shows", async () => {
    const h = editor()
    await h.edit()
    expect(h.edited).toEqual([[1259, "New title", "New body", "owner", "repo"]])
    expect(h.state().prInfo).toMatchObject({ number: 1259, title: "New title", body: "New body" })
    expect(h.toast.current()).toMatchObject({ message: "PR updated", type: "success" })
    expect(h.later).toEqual([{ ms: 2000 }])
  })

  test("an edit saved after riff moved on to another PR leaves that PR's title alone", async () => {
    const other = prInfo("Another body", { number: 77, title: "Another PR" })
    const h = editor({
      openPrEditor: async () => {
        h.setState((s) => ({ ...s, prInfo: other }))
        return { title: "New title", body: "New body" }
      },
    })
    await h.edit()
    expect(h.edited).toEqual([[1259, "New title", "New body", "owner", "repo"]])
    expect(h.state().prInfo).toBe(other)
    expect(h.toast.current()).toMatchObject({ message: "PR updated", type: "success" })
  })

  test("a diff gh will not fetch never takes the terminal, and says why", async () => {
    const h = editor({ getPrDiff: async () => { throw new Error("no network") } })
    await h.edit()
    expect(h.terminal).toEqual([])
    expect(h.toast.current()).toMatchObject({ message: "Error: no network", type: "error" })
    expect(h.later).toEqual([{ ms: 3000 }])
  })

  test("an edit gh will not save gives the terminal back once, and says why", async () => {
    const h = editor({ editPullRequest: async () => { throw new Error("forbidden") } })
    await h.edit()
    expect(h.terminal).toEqual(["suspend", "resume"])
    expect(h.state().prInfo?.title).toBe(prInfo("").title)
    expect(h.toast.current()).toMatchObject({ message: "Error: forbidden", type: "error" })
    expect(h.later).toEqual([{ ms: 3000 }])
  })
})

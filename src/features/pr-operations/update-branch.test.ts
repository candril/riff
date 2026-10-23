import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { parseDiff, sortFiles } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { createToastState } from "../toast/state"
import { createConfirmState } from "../confirm/state"
import { prInfo } from "../../testing/pr-info"
import { THREE_TOP_LEVEL_FILES } from "../../testing/refresh-harness"
import type { PrInfo } from "../../providers/github/types"
import { updateBranchCommand, type ReadyResult, type UpdateMethod } from "../../providers/github/mutations"
import type { BehindBy } from "../../components/merge-status-model"
import { handleUpdateBranch, type UpdateBranchSources } from "./update-branch"

const behind = (extra: Partial<PrInfo> = {}) => prInfo("", { mergeStateStatus: "BEHIND", ...extra })

function harness(pr: PrInfo, behindBy: BehindBy, sources: Partial<UpdateBranchSources> = {}) {
  const files = sortFiles(parseDiff(THREE_TOP_LEVEL_FILES))
  let state: AppState = createInitialState(files, buildFileTree(files), "gh:owner/repo#1259", "", null, null, [], "pr", pr)
  const sent: string[] = []
  const methods: UpdateMethod[] = []
  const refetched: string[] = []
  const settled: BehindBy[] = []
  const toast = createToastState()
  const confirm = createConfirmState()
  const recording: UpdateBranchSources = {
    updatePullRequestBranch: async (owner: string, repo: string, n: number, method: UpdateMethod): Promise<ReadyResult> => {
      sent.push(updateBranchCommand(owner, repo, n, method).join(" "))
      methods.push(method)
      return { success: true }
    },
    fetchPrInfo: async (owner: string, repo: string, n: number): Promise<PrInfo> => {
      refetched.push(`${owner}/${repo}#${n}`)
      return { ...state.prInfo!, mergeStateStatus: "CLEAN", title: "Fresh from GitHub" }
    },
  }
  const ctx = {
    sources: { ...recording, ...sources },
    getState: () => state,
    setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
    confirm,
    toast,
    render: () => {},
    later: () => {},
    behindBy: () => behindBy,
    settleBehindBy: (next: BehindBy) => { settled.push(next) },
  }
  return {
    update: () => handleUpdateBranch(ctx),
    state: () => state,
    setState: ctx.setState,
    confirm,
    toast,
    sent,
    methods,
    refetched,
    settled,
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

describe("updating a pull request's branch", () => {
  test.each([
    ["merged", { state: "merged" }, 3, "PR is merged"],
    ["closed", { state: "closed" }, 3, "PR is closed"],
    ["up to date", { mergeStateStatus: "CLEAN" }, 0, "Up to date with master"],
    ["not asked yet", { mergeStateStatus: "CLEAN" }, null, "Not known to be behind master yet"],
    ["lookup failed", { mergeStateStatus: "CLEAN" }, "failed", "Not known to be behind master yet"],
  ] as const)("%s: an info toast says why, and nothing is asked or sent", (_, extra, behindBy, message) => {
    const h = harness(behind(extra as Partial<PrInfo>), behindBy)
    const before = h.state()
    h.update()
    expect(h.toast.current()).toMatchObject({ message, type: "info" })
    expect(h.confirm.dialog()).toBeNull()
    expect(h.state()).toBe(before)
    expect(h.sent).toEqual([])
  })

  test("BEHIND asks even before the count is heard", () => {
    const h = harness(behind(), null)
    h.update()
    expect(h.confirm.dialog()).toMatchObject({
      title: "Update Branch",
      message: "owner/repo#1259 from master: merges master into a-branch",
      details: "gh pr update-branch 1259 -R owner/repo",
    })
  })

  test("a head known to be behind asks without BEHIND, names the count, and offers r with --rebase", () => {
    const h = harness(behind({ mergeStateStatus: "CLEAN" }), 3)
    h.update()
    expect(h.confirm.dialog()).toMatchObject({
      message: "owner/repo#1259 from master: merges master into a-branch, 3 commits behind",
      details: "gh pr update-branch 1259 -R owner/repo",
      alternative: {
        key: "r",
        label: "rebase onto master instead, rewriting a-branch's history",
        details: "gh pr update-branch 1259 -R owner/repo --rebase",
      },
    })
    expect(h.sent).toEqual([])
  })

  test("y sends a merge, r a rebase", async () => {
    const y = harness(behind(), 2)
    y.update()
    y.confirm.dialog()!.onConfirm()
    await settle()
    expect(y.confirm.dialog()).toBeNull()
    expect(y.methods).toEqual(["merge"])
    expect(y.sent).toEqual(["gh pr update-branch 1259 -R owner/repo"])
    expect(y.toast.current()).toMatchObject({ message: "Branch updated from master", type: "success" })

    const r = harness(behind(), 2)
    r.update()
    r.confirm.dialog()!.alternative!.onConfirm()
    await settle()
    expect(r.confirm.dialog()).toBeNull()
    expect(r.methods).toEqual(["rebase"])
    expect(r.sent).toEqual(["gh pr update-branch 1259 -R owner/repo --rebase"])
    expect(r.toast.current()).toMatchObject({ message: "Branch rebased onto master", type: "success" })
  })

  test("nothing changes before gh answers", async () => {
    let answer: (r: ReadyResult) => void = () => {}
    const h = harness(behind(), 2, { updatePullRequestBranch: () => new Promise<ReadyResult>((r) => { answer = r }) })
    const before = h.state()
    h.update()
    h.confirm.dialog()!.onConfirm()
    expect(h.state()).toBe(before)
    expect(h.settled).toEqual([])
    answer({ success: true })
    await settle()
    expect(h.settled).toEqual([0])
  })

  test("success settles the count at 0 and patches in the refetch", async () => {
    const h = harness(behind(), 2)
    h.update()
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.settled).toEqual([0])
    expect(h.refetched).toEqual(["owner/repo#1259"])
    expect(h.state().prInfo).toMatchObject({ title: "Fresh from GitHub", mergeStateStatus: "CLEAN" })
  })

  test("an update gh refuses shows gh's message and changes nothing", async () => {
    const h = harness(behind(), 2, { updatePullRequestBranch: async () => ({ success: false, error: "merge conflict between base and head" }) })
    const before = h.state()
    h.update()
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.toast.current()).toMatchObject({ message: "Error: merge conflict between base and head", type: "error" })
    expect(h.state()).toBe(before)
    expect(h.settled).toEqual([])
    expect(h.refetched).toEqual([])
  })

  test("an answer landing after riff moved to another PR touches neither the count nor the PR", async () => {
    const other = prInfo("", { number: 77 })
    const h = harness(behind(), 2, {
      updatePullRequestBranch: async () => {
        h.setState((s) => ({ ...s, prInfo: other }))
        return { success: true }
      },
    })
    h.update()
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.settled).toEqual([])
    expect(h.state().prInfo).toBe(other)
  })

  test("a refetch landing after riff moved to another PR is dropped", async () => {
    const other = prInfo("", { number: 77 })
    const h = harness(behind(), 2, {
      fetchPrInfo: async () => {
        h.setState((s) => ({ ...s, prInfo: other }))
        return { ...behind(), title: "Fresh from GitHub" }
      },
    })
    h.update()
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.state().prInfo).toBe(other)
  })

  test("cancel changes nothing and sends nothing", () => {
    const h = harness(behind(), 2)
    const before = h.state()
    h.update()
    h.confirm.dialog()!.onCancel()
    expect(h.confirm.dialog()).toBeNull()
    expect(h.state()).toBe(before)
    expect(h.sent).toEqual([])
  })
})

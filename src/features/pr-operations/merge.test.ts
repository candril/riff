import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { parseDiff, sortFiles } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { createToastState } from "../toast/state"
import { createConfirmState } from "../confirm/state"
import { prInfo } from "../../testing/pr-info"
import { THREE_TOP_LEVEL_FILES } from "../../testing/refresh-harness"
import type { MergeMethod, PrInfo } from "../../providers/github/types"
import { mergeCommand, type MergeOptions, type MergeResult } from "../../providers/github/mutations"
import { handleMerge, type MergeSources } from "./merge"

const mergeable = (extra: Partial<PrInfo> = {}) =>
  prInfo("", {
    isDraft: false,
    mergeStateStatus: "CLEAN",
    mergeMethods: ["squash", "merge", "rebase"],
    deleteBranchOnMerge: false,
    ...extra,
  })

function harness(pr: PrInfo, sources: Partial<MergeSources> = {}) {
  const files = sortFiles(parseDiff(THREE_TOP_LEVEL_FILES))
  let state: AppState = createInitialState(files, buildFileTree(files), "gh:owner/repo#1259", "", null, null, [], "pr", pr)
  const sent: string[] = []
  const refetched: string[] = []
  const toast = createToastState()
  const confirm = createConfirmState()
  const recording: MergeSources = {
    mergePullRequest: async (owner: string, repo: string, n: number, options: MergeOptions): Promise<MergeResult> => {
      sent.push(mergeCommand(owner, repo, n, options).join(" "))
      return { success: true }
    },
    fetchPrInfo: async (owner: string, repo: string, n: number): Promise<PrInfo> => {
      refetched.push(`${owner}/${repo}#${n}`)
      return { ...state.prInfo!, title: "Fresh from GitHub" }
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
  }
  return {
    merge: (method: MergeMethod = "squash") => handleMerge(ctx, method),
    state: () => state,
    setState: ctx.setState,
    confirm,
    toast,
    sent,
    refetched,
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

describe("merging a pull request", () => {
  test.each([
    ["merged", { state: "merged" }, "PR is merged"],
    ["closed", { state: "closed" }, "PR is closed"],
    ["draft", { isDraft: true }, "PR is a draft: mark it ready first"],
    ["method off", { mergeMethods: ["merge"] }, "squash merges are off in owner/repo"],
    ["no repository settings", { mergeMethods: undefined }, "squash merges are off in owner/repo"],
    ["queue", { mergeQueue: { entry: null, inQueue: false, removal: null } }, "master merges through a queue"],
    ["conflicts", { mergeStateStatus: "DIRTY" }, "Can't merge: conflicts"],
    ["behind", { mergeStateStatus: "BEHIND" }, "Can't merge: behind master"],
    ["blocked, no admin", { mergeStateStatus: "BLOCKED", reviewDecision: "REVIEW_REQUIRED", checks: [] }, "Can't merge: needs review"],
    ["unknown", { mergeStateStatus: "UNKNOWN" }, "Can't merge: waiting for GitHub"],
  ] as const)("%s: an info toast says why, and nothing is asked or sent", (_, extra, message) => {
    const h = harness(mergeable(extra as Partial<PrInfo>))
    const before = h.state()
    h.merge()
    expect(h.toast.current()).toMatchObject({ message, type: "info" })
    expect(h.confirm.dialog()).toBeNull()
    expect(h.state()).toBe(before)
    expect(h.sent).toEqual([])
  })

  test.each(["HAS_HOOKS", "UNSTABLE"] as const)("%s merges like CLEAN", (mergeStateStatus) => {
    const h = harness(mergeable({ mergeStateStatus }))
    h.merge()
    expect(h.confirm.dialog()?.details).toBe("gh pr merge 1259 -R owner/repo --squash")
  })

  test("the dialog names the method, owner/repo#N, the base and the exact command, and offers d with its own", () => {
    const h = harness(mergeable())
    h.merge("rebase")
    expect(h.confirm.dialog()).toMatchObject({
      title: "Rebase and Merge",
      message: "owner/repo#1259 into master",
      details: "gh pr merge 1259 -R owner/repo --rebase",
      alternative: {
        key: "d",
        label: "merge and delete the branch",
        details: "gh pr merge 1259 -R owner/repo --rebase --delete-branch",
      },
    })
    expect(h.sent).toEqual([])
  })

  test("when the repository deletes the branch itself, the dialog says so and offers no d", () => {
    const h = harness(mergeable({ deleteBranchOnMerge: true }))
    h.merge("merge")
    const dialog = h.confirm.dialog()!
    expect(dialog).toMatchObject({
      title: "Create a Merge Commit",
      message: "owner/repo#1259 into master: the repository deletes the branch",
      details: "gh pr merge 1259 -R owner/repo --merge",
    })
    expect(dialog.alternative).toBeUndefined()
  })

  test("blocked with admin rights merges with --admin, and the dialog says it bypasses protection", async () => {
    const h = harness(mergeable({ mergeStateStatus: "BLOCKED", viewerCanMergeAsAdmin: true }))
    h.merge()
    expect(h.confirm.dialog()).toMatchObject({
      message: "owner/repo#1259 into master: bypasses master's branch protection",
      details: "gh pr merge 1259 -R owner/repo --squash --admin",
    })
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.sent).toEqual(["gh pr merge 1259 -R owner/repo --squash --admin"])
  })

  test("y sends the plain command, d the one that deletes the branch", async () => {
    const y = harness(mergeable())
    y.merge()
    y.confirm.dialog()!.onConfirm()
    await settle()
    expect(y.sent).toEqual(["gh pr merge 1259 -R owner/repo --squash"])
    expect(y.toast.current()).toMatchObject({ message: "PR merged", type: "success" })

    const d = harness(mergeable())
    d.merge()
    d.confirm.dialog()!.alternative!.onConfirm()
    await settle()
    expect(d.confirm.dialog()).toBeNull()
    expect(d.sent).toEqual(["gh pr merge 1259 -R owner/repo --squash --delete-branch"])
    expect(d.toast.current()).toMatchObject({ message: "PR merged, branch deleted", type: "success" })
  })

  test("confirm marks the PR merged before gh answers", async () => {
    let answer: (r: MergeResult) => void = () => {}
    const h = harness(mergeable(), { mergePullRequest: () => new Promise<MergeResult>((r) => { answer = r }) })
    h.merge()
    h.confirm.dialog()!.onConfirm()
    expect(h.confirm.dialog()).toBeNull()
    expect(h.state().prInfo?.state).toBe("merged")
    answer({ success: true })
    await settle()
    expect(h.toast.current()).toMatchObject({ message: "PR merged" })
  })

  test("a merge gh refuses puts the state back and shows gh's message", async () => {
    const h = harness(mergeable(), { mergePullRequest: async () => ({ success: false, error: "Base branch was modified" }) })
    h.merge()
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.state().prInfo?.state).toBe("open")
    expect(h.toast.current()).toMatchObject({ message: "Error: Base branch was modified", type: "error" })
    expect(h.refetched).toEqual([])
  })

  test("success refetches the PR's info and patches it in", async () => {
    const h = harness(mergeable())
    h.merge()
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.refetched).toEqual(["owner/repo#1259"])
    expect(h.state().prInfo).toMatchObject({ title: "Fresh from GitHub", state: "merged" })
  })

  test("a refetch that fails keeps the merged state and stays quiet", async () => {
    const h = harness(mergeable(), { fetchPrInfo: async () => { throw new Error("offline") } })
    h.merge()
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.state().prInfo?.state).toBe("merged")
    expect(h.toast.current()).toMatchObject({ type: "success" })
  })

  test("a refetch landing after riff moved to another PR is dropped", async () => {
    const other = prInfo("", { number: 77 })
    const h = harness(mergeable(), {
      fetchPrInfo: async () => {
        h.setState((s) => ({ ...s, prInfo: other }))
        return { ...mergeable(), title: "Fresh from GitHub" }
      },
    })
    h.merge()
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.state().prInfo).toBe(other)
  })

  test("cancel changes nothing and sends nothing", () => {
    const h = harness(mergeable())
    const before = h.state()
    h.merge()
    h.confirm.dialog()!.onCancel()
    expect(h.confirm.dialog()).toBeNull()
    expect(h.state()).toBe(before)
    expect(h.sent).toEqual([])
  })
})

import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { parseDiff, sortFiles } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { createToastState } from "../toast/state"
import { createConfirmState } from "../confirm/state"
import { prInfo } from "../../testing/pr-info"
import { THREE_TOP_LEVEL_FILES } from "../../testing/refresh-harness"
import type { PrInfo } from "../../providers/github/types"
import type { ReadyResult } from "../../providers/github/mutations"
import { handleToggleReady, type ReadyStateSources } from "./ready-state"

function harness(pr: PrInfo, sources: Partial<ReadyStateSources> = {}) {
  const files = sortFiles(parseDiff(THREE_TOP_LEVEL_FILES))
  let state: AppState = createInitialState(files, buildFileTree(files), "gh:owner/repo#1259", "", null, null, [], "pr", pr)
  const sent: string[] = []
  const refetched: string[] = []
  const toast = createToastState()
  const confirm = createConfirmState()
  const recording: ReadyStateSources = {
    markPullRequestReady: async (owner: string, repo: string, n: number): Promise<ReadyResult> => {
      sent.push(`ready ${owner}/${repo}#${n}`)
      return { success: true }
    },
    markPullRequestDraft: async (owner: string, repo: string, n: number): Promise<ReadyResult> => {
      sent.push(`draft ${owner}/${repo}#${n}`)
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
    toggle: () => handleToggleReady(ctx),
    state: () => state,
    setState: ctx.setState,
    confirm,
    toast,
    sent,
    refetched,
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

describe("marking a pull request ready or back to draft", () => {
  test("the dialog shows owner/repo#N and the exact command, and nothing goes out before confirm", () => {
    const h = harness(prInfo("", { isDraft: true }))
    h.toggle()
    expect(h.confirm.dialog()).toMatchObject({
      title: "Mark Ready for Review",
      message: "owner/repo#1259: reviewers are notified and the PR can merge",
      details: "gh pr ready 1259 -R owner/repo",
    })
    expect(h.sent).toEqual([])
    expect(h.state().prInfo?.isDraft).toBe(true)
  })

  test("converting to draft shows --undo in the command", () => {
    const h = harness(prInfo("", { isDraft: false }))
    h.toggle()
    expect(h.confirm.dialog()).toMatchObject({
      title: "Convert to Draft",
      message: "owner/repo#1259: the PR can't merge until it's marked ready again",
      details: "gh pr ready 1259 -R owner/repo --undo",
    })
  })

  test("confirm flips isDraft before gh answers, then sends the right mutation", async () => {
    let answer: (r: ReadyResult) => void = () => {}
    const h = harness(prInfo("", { isDraft: true }), {
      markPullRequestReady: (owner: string, repo: string, n: number) => {
        h.sent.push(`ready ${owner}/${repo}#${n}`)
        return new Promise<ReadyResult>((r) => { answer = r })
      },
    })
    h.toggle()
    h.confirm.dialog()!.onConfirm()
    expect(h.confirm.dialog()).toBeNull()
    expect(h.state().prInfo?.isDraft).toBe(false)
    expect(h.sent).toEqual(["ready owner/repo#1259"])
    answer({ success: true })
    await settle()
    expect(h.toast.current()).toMatchObject({ message: "PR marked ready for review", type: "success" })
  })

  test("a mutation gh refuses puts isDraft back and shows GitHub's message", async () => {
    const h = harness(prInfo("", { isDraft: false }), {
      markPullRequestDraft: async () => ({ success: false, error: "Pull request is in clean status" }),
    })
    h.toggle()
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.state().prInfo?.isDraft).toBe(false)
    expect(h.toast.current()).toMatchObject({ message: "Error: Pull request is in clean status", type: "error" })
    expect(h.refetched).toEqual([])
  })

  test("success refetches the PR's info and patches it in", async () => {
    const h = harness(prInfo("", { isDraft: true }))
    h.toggle()
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.refetched).toEqual(["owner/repo#1259"])
    expect(h.state().prInfo).toMatchObject({ title: "Fresh from GitHub", isDraft: false })
  })

  test("a refetch that fails keeps the flip and stays quiet", async () => {
    const h = harness(prInfo("", { isDraft: true }), { fetchPrInfo: async () => { throw new Error("offline") } })
    h.toggle()
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.state().prInfo?.isDraft).toBe(false)
    expect(h.toast.current()).toMatchObject({ type: "success" })
  })

  test("a PR riff moved to while gh was awaited is touched by neither the flip-back nor the refetch", async () => {
    const other = prInfo("", { number: 77, isDraft: true })
    const failing = harness(prInfo("", { isDraft: true }), {
      markPullRequestReady: async () => {
        failing.setState((s) => ({ ...s, prInfo: other }))
        return { success: false, error: "nope" }
      },
    })
    failing.toggle()
    failing.confirm.dialog()!.onConfirm()
    await settle()
    expect(failing.state().prInfo).toBe(other)

    const succeeding = harness(prInfo("", { isDraft: true }), {
      markPullRequestReady: async () => {
        succeeding.setState((s) => ({ ...s, prInfo: other }))
        return { success: true }
      },
    })
    succeeding.toggle()
    succeeding.confirm.dialog()!.onConfirm()
    await settle()
    expect(succeeding.state().prInfo).toBe(other)
  })

  test("cancel changes nothing and sends nothing", () => {
    const h = harness(prInfo("", { isDraft: true }))
    const before = h.state()
    h.toggle()
    h.confirm.dialog()!.onCancel()
    expect(h.confirm.dialog()).toBeNull()
    expect(h.state()).toBe(before)
    expect(h.sent).toEqual([])
  })

  test.each(["merged", "closed"] as const)("a %s PR is not offered, and the toast says why", (prState) => {
    const h = harness(prInfo("", { state: prState, isDraft: false }))
    h.toggle()
    expect(h.confirm.dialog()).toBeNull()
    expect(h.sent).toEqual([])
    expect(h.toast.current()).toMatchObject({ message: `PR is ${prState}` })
  })
})

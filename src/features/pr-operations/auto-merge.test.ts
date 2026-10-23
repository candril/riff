import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { parseDiff, sortFiles } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { createToastState } from "../toast/state"
import { createConfirmState } from "../confirm/state"
import { prInfo } from "../../testing/pr-info"
import { THREE_TOP_LEVEL_FILES } from "../../testing/refresh-harness"
import type { MergeMethod, PrInfo, PrMergeQueue } from "../../providers/github/types"
import type { ReadyResult } from "../../providers/github/mutations"
import {
  handleDequeue,
  handleDisableAutoMerge,
  handleEnableAutoMerge,
  handleEnqueue,
  type AutoMergeSources,
} from "./auto-merge"

const queue = (extra: Partial<PrMergeQueue> = {}): PrMergeQueue => ({ entry: null, inQueue: false, removal: null, ...extra })

const blocked = (extra: Partial<PrInfo> = {}) =>
  prInfo("", {
    mergeStateStatus: "BLOCKED",
    mergeMethods: ["squash", "merge", "rebase"],
    autoMergeAllowed: true,
    autoMergeMethod: null,
    nodeId: "PR_kwDO",
    ...extra,
  })

function harness(pr: PrInfo, sources: Partial<AutoMergeSources> = {}) {
  const files = sortFiles(parseDiff(THREE_TOP_LEVEL_FILES))
  let state: AppState = createInitialState(files, buildFileTree(files), "gh:owner/repo#1259", "", null, null, [], "pr", pr)
  const sent: unknown[][] = []
  const refetched: string[] = []
  const toast = createToastState()
  const confirm = createConfirmState()
  const ok = (...args: unknown[]): Promise<ReadyResult> => {
    sent.push(args)
    return Promise.resolve({ success: true })
  }
  const recording: AutoMergeSources = {
    enableAutoMerge: ok,
    disableAutoMerge: ok,
    enqueuePullRequest: ok,
    dequeuePullRequest: ok,
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
    enable: (method: MergeMethod) => handleEnableAutoMerge(ctx, method),
    disable: () => handleDisableAutoMerge(ctx),
    enqueue: () => handleEnqueue(ctx),
    dequeue: () => handleDequeue(ctx),
    state: () => state,
    setState: ctx.setState,
    confirm,
    toast,
    sent,
    refetched,
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

type Run = (h: ReturnType<typeof harness>) => void
const enable: Run = (h) => h.enable("squash")
const disable: Run = (h) => h.disable()
const enqueue: Run = (h) => h.enqueue()
const dequeue: Run = (h) => h.dequeue()

describe("auto-merge and the merge queue refuse", () => {
  test.each([
    ["enable on a merged PR", enable, { state: "merged" }, "PR is merged"],
    ["enable on a draft", enable, { isDraft: true }, "PR is a draft: mark it ready first"],
    ["enable where the repository forbids it", enable, { autoMergeAllowed: false }, "auto-merge is off in owner/repo"],
    ["enable with a method the repository forbids", enable, { mergeMethods: ["merge"] }, "squash merges are off in owner/repo"],
    ["enable on a queued base", enable, { mergeQueue: queue() }, "master merges through a queue: add it to the queue"],
    ["enable when already armed", enable, { autoMergeMethod: "rebase" }, "auto-merge is already on (rebase)"],
    ["enable on a clean PR", enable, { mergeStateStatus: "CLEAN" }, "PR can merge now: merge it instead"],
    ["enable on a PR with hooks", enable, { mergeStateStatus: "HAS_HOOKS" }, "PR can merge now: merge it instead"],
    ["enable on an unstable PR", enable, { mergeStateStatus: "UNSTABLE" }, "PR can merge now: merge it instead"],
    ["disable on a closed PR", disable, { state: "closed", autoMergeMethod: "squash" }, "PR is closed"],
    ["disable when off", disable, {}, "auto-merge is off"],
    ["enqueue on a closed PR", enqueue, { state: "closed", mergeQueue: queue() }, "PR is closed"],
    ["enqueue a draft", enqueue, { isDraft: true, mergeQueue: queue() }, "PR is a draft: mark it ready first"],
    ["enqueue without a queue", enqueue, {}, "master has no merge queue"],
    ["enqueue when queued", enqueue, { mergeQueue: queue({ inQueue: true }) }, "PR is already in the queue"],
    ["enqueue when armed for the queue", enqueue, { mergeQueue: queue(), autoMergeMethod: "merge" }, "PR joins the queue once checks pass"],
    ["dequeue on a merged PR", dequeue, { state: "merged", mergeQueue: queue({ inQueue: true }) }, "PR is merged"],
    ["dequeue when not queued", dequeue, { mergeQueue: queue() }, "PR is not in the queue"],
    ["dequeue without a node id", dequeue, { mergeQueue: queue({ inQueue: true }), nodeId: undefined }, "PR's node id is unknown: refresh it first"],
  ] as const)("%s: an info toast says why, and nothing is asked or sent", (_, run, extra, message) => {
    const h = harness(blocked(extra as Partial<PrInfo>))
    const before = h.state()
    run(h)
    expect(h.toast.current()).toMatchObject({ message, type: "info" })
    expect(h.confirm.dialog()).toBeNull()
    expect(h.state()).toBe(before)
    expect(h.sent).toEqual([])
  })
})

describe("auto-merge and the merge queue ask first", () => {
  test.each([
    ["Enable Auto-Merge", enable, {}, "owner/repo#1259 into master once requirements pass (squash)", "gh pr merge 1259 -R owner/repo --auto --squash"],
    ["Disable Auto-Merge", disable, { autoMergeMethod: "squash" }, "owner/repo#1259 stops merging on its own (squash)", "gh pr merge 1259 -R owner/repo --disable-auto"],
    ["Add to Merge Queue", enqueue, { mergeQueue: queue() }, "owner/repo#1259 into master's merge queue", "gh pr merge 1259 -R owner/repo"],
    [
      "Remove from Merge Queue",
      dequeue,
      { mergeQueue: queue({ inQueue: true }) },
      "owner/repo#1259 out of master's merge queue",
      "gh api graphql -f query=mutation($id: ID!) { dequeuePullRequest(input: {id: $id}) { clientMutationId } } -F id=PR_kwDO",
    ],
  ] as const)("%s shows the exact command and offers no alternative", (title, run, extra, message, details) => {
    const h = harness(blocked(extra as Partial<PrInfo>))
    run(h)
    expect(h.confirm.dialog()).toMatchObject({ title, message, details })
    expect(h.confirm.dialog()!.alternative).toBeUndefined()
    expect(h.sent).toEqual([])
  })

  test("cancel sends nothing and leaves the PR as it was", () => {
    const h = harness(blocked())
    const before = h.state()
    h.enable("squash")
    h.confirm.dialog()!.onCancel()
    expect(h.confirm.dialog()).toBeNull()
    expect(h.sent).toEqual([])
    expect(h.state()).toBe(before)
  })
})

describe("auto-merge and the merge queue on confirm", () => {
  function pending() {
    let resolve: (r: ReadyResult) => void = () => {}
    const runner = (..._: unknown[]) => new Promise<ReadyResult>((r) => { resolve = r })
    return { runner, resolve: (r: ReadyResult) => resolve(r) }
  }

  test.each([
    ["enable", enable, "enableAutoMerge", {}, (p: PrInfo) => expect(p.autoMergeMethod).toBe("squash")],
    ["disable", disable, "disableAutoMerge", { autoMergeMethod: "merge" }, (p: PrInfo) => expect(p.autoMergeMethod).toBeNull()],
    [
      "enqueue",
      enqueue,
      "enqueuePullRequest",
      { mergeQueue: queue({ removal: { reason: "MANUAL", at: "t" } }) },
      (p: PrInfo) => expect(p.mergeQueue).toEqual({ entry: null, inQueue: true, removal: null }),
    ],
    [
      "dequeue",
      dequeue,
      "dequeuePullRequest",
      {
        mergeQueue: queue({
          inQueue: true,
          entry: { position: 2, total: 3, state: "QUEUED", etaSeconds: null, enqueuedAt: null, enqueuer: null },
        }),
      },
      (p: PrInfo) => expect(p.mergeQueue).toEqual({ entry: null, inQueue: false, removal: null }),
    ],
  ] as const)("%s patches the panel before gh answers, and a refusal puts it back with an error toast", async (_, run, source, extra, patched) => {
    const gh = pending()
    const h = harness(blocked(extra as Partial<PrInfo>), { [source]: gh.runner })
    const before = h.state().prInfo!
    run(h)
    h.confirm.dialog()!.onConfirm()
    expect(h.confirm.dialog()).toBeNull()
    patched(h.state().prInfo!)

    gh.resolve({ success: false, error: "GraphQL: no" })
    await settle()
    expect(h.state().prInfo!.autoMergeMethod).toEqual(before.autoMergeMethod)
    expect(h.state().prInfo!.mergeQueue).toEqual(before.mergeQueue)
    expect(h.toast.current()).toMatchObject({ message: "Error: GraphQL: no", type: "error" })
    expect(h.refetched).toEqual([])
  })

  test("each runner gets exactly its arguments and its success toast", async () => {
    const cases: [Run, Partial<PrInfo>, unknown[], string][] = [
      [enable, {}, ["owner", "repo", 1259, "squash"], "Auto-merge on (squash)"],
      [disable, { autoMergeMethod: "squash" }, ["owner", "repo", 1259], "Auto-merge off"],
      [enqueue, { mergeQueue: queue() }, ["owner", "repo", 1259], "Added to the merge queue"],
      [dequeue, { mergeQueue: queue({ inQueue: true }) }, ["PR_kwDO"], "Removed from the merge queue"],
    ]
    for (const [run, extra, args, done] of cases) {
      const h = harness(blocked(extra))
      run(h)
      h.confirm.dialog()!.onConfirm()
      await settle()
      expect(h.sent).toEqual([args])
      expect(h.toast.current()).toMatchObject({ message: done, type: "success" })
    }
  })

  test("the refetch lands after success, and a failing one is swallowed", async () => {
    const h = harness(blocked())
    h.enable("squash")
    h.confirm.dialog()!.onConfirm()
    await settle()
    expect(h.refetched).toEqual(["owner/repo#1259"])
    expect(h.state().prInfo!.title).toBe("Fresh from GitHub")

    const failing = harness(blocked(), { fetchPrInfo: () => Promise.reject(new Error("offline")) })
    failing.enable("squash")
    failing.confirm.dialog()!.onConfirm()
    await settle()
    expect(failing.state().prInfo!.autoMergeMethod).toBe("squash")
    expect(failing.toast.current()).toMatchObject({ message: "Auto-merge on (squash)", type: "success" })
  })

  test("a refetch landing after riff moved to another PR is dropped", async () => {
    const other = prInfo("", { number: 77 })
    const gh = pending()
    const h = harness(blocked(), { enableAutoMerge: gh.runner })
    h.enable("squash")
    h.confirm.dialog()!.onConfirm()
    h.setState((s) => ({ ...s, prInfo: other }))
    gh.resolve({ success: true })
    await settle()
    expect(h.refetched).toEqual(["owner/repo#1259"])
    expect(h.state().prInfo).toBe(other)
  })
})

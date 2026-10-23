/**
 * Auto-merge and the merge queue (spec 110). Each is a write to GitHub, so
 * each asks first, shows the exact command, and patches the panel at once.
 * The palette offers them on loose terms; the refusals land here, where a
 * toast can say why.
 */

import type { MergeMethod, PrInfo } from "../../providers/github/types"
import {
  autoMergeCommand,
  dequeueCommand,
  dequeuePullRequest,
  disableAutoMerge,
  disableAutoMergeCommand,
  enableAutoMerge,
  enqueueCommand,
  enqueuePullRequest,
  type ReadyResult,
} from "../../providers/github/mutations"
import { fetchPrInfo } from "../../providers/github/session"
import { flash, patchSamePr, prRef, type PrActionContext } from "./pr-action"

export interface AutoMergeSources {
  enableAutoMerge: typeof enableAutoMerge
  disableAutoMerge: typeof disableAutoMerge
  enqueuePullRequest: typeof enqueuePullRequest
  dequeuePullRequest: typeof dequeuePullRequest
  fetchPrInfo: typeof fetchPrInfo
}

export const liveAutoMergeSources: AutoMergeSources = {
  enableAutoMerge,
  disableAutoMerge,
  enqueuePullRequest,
  dequeuePullRequest,
  fetchPrInfo,
}

export type AutoMergeContext = PrActionContext<AutoMergeSources>

interface Action {
  title: string
  message: string
  command: string[]
  patch: (current: PrInfo) => PrInfo
  revert: (current: PrInfo) => PrInfo
  run: () => Promise<ReadyResult>
  done: string
}

export function handleEnableAutoMerge(ctx: AutoMergeContext, method: MergeMethod): void {
  withPr(ctx, (prInfo) => {
    const { owner, repo, number } = prInfo
    return {
      refusal: enableRefusal(prInfo, method),
      action: () => ({
        title: "Enable Auto-Merge",
        message: `${prRef(prInfo)} into ${prInfo.baseRef} once requirements pass (${method})`,
        command: autoMergeCommand(owner, repo, number, method),
        patch: (current) => ({ ...current, autoMergeMethod: method }),
        revert: (current) => ({ ...current, autoMergeMethod: prInfo.autoMergeMethod ?? null }),
        run: () => ctx.sources.enableAutoMerge(owner, repo, number, method),
        done: `Auto-merge on (${method})`,
      }),
    }
  })
}

export function handleDisableAutoMerge(ctx: AutoMergeContext): void {
  withPr(ctx, (prInfo) => {
    const { owner, repo, number } = prInfo
    return {
      refusal: notOpen(prInfo) ?? (prInfo.autoMergeMethod ? null : "auto-merge is off"),
      action: () => ({
        title: "Disable Auto-Merge",
        message: `${prRef(prInfo)} stops merging on its own (${prInfo.autoMergeMethod})`,
        command: disableAutoMergeCommand(owner, repo, number),
        patch: (current) => ({ ...current, autoMergeMethod: null }),
        revert: (current) => ({ ...current, autoMergeMethod: prInfo.autoMergeMethod ?? null }),
        run: () => ctx.sources.disableAutoMerge(owner, repo, number),
        done: "Auto-merge off",
      }),
    }
  })
}

export function handleEnqueue(ctx: AutoMergeContext): void {
  withPr(ctx, (prInfo) => {
    const { owner, repo, number } = prInfo
    return {
      refusal: enqueueRefusal(prInfo),
      action: () => ({
        title: "Add to Merge Queue",
        message: `${prRef(prInfo)} into ${prInfo.baseRef}'s merge queue`,
        command: enqueueCommand(owner, repo, number),
        patch: (current) => ({ ...current, mergeQueue: current.mergeQueue && { ...current.mergeQueue, inQueue: true, removal: null } }),
        revert: (current) => ({ ...current, mergeQueue: prInfo.mergeQueue }),
        run: () => ctx.sources.enqueuePullRequest(owner, repo, number),
        done: "Added to the merge queue",
      }),
    }
  })
}

export function handleDequeue(ctx: AutoMergeContext): void {
  withPr(ctx, (prInfo) => {
    const nodeId = prInfo.nodeId ?? ""
    return {
      refusal: notOpen(prInfo)
        ?? (prInfo.mergeQueue?.inQueue ? null : "PR is not in the queue")
        ?? (nodeId ? null : "PR's node id is unknown: refresh it first"),
      action: () => ({
        title: "Remove from Merge Queue",
        message: `${prRef(prInfo)} out of ${prInfo.baseRef}'s merge queue`,
        command: dequeueCommand(nodeId),
        patch: (current) => ({ ...current, mergeQueue: current.mergeQueue && { ...current.mergeQueue, inQueue: false, entry: null } }),
        revert: (current) => ({ ...current, mergeQueue: prInfo.mergeQueue }),
        run: () => ctx.sources.dequeuePullRequest(nodeId),
        done: "Removed from the merge queue",
      }),
    }
  })
}

function notOpen(prInfo: PrInfo): string | null {
  return prInfo.state === "open" ? null : `PR is ${prInfo.state}`
}

function enableRefusal(prInfo: PrInfo, method: MergeMethod): string | null {
  const { owner, repo } = prInfo
  if (prInfo.state !== "open") return `PR is ${prInfo.state}`
  if (prInfo.isDraft) return "PR is a draft: mark it ready first"
  if (prInfo.autoMergeAllowed === false) return `auto-merge is off in ${owner}/${repo}`
  if (!prInfo.mergeMethods?.includes(method)) return `${method} merges are off in ${owner}/${repo}`
  if (prInfo.mergeQueue) return `${prInfo.baseRef} merges through a queue: add it to the queue`
  if (prInfo.autoMergeMethod) return `auto-merge is already on (${prInfo.autoMergeMethod})`
  // GitHub itself refuses to arm auto-merge on a PR that could merge now.
  const status = prInfo.mergeStateStatus
  if (status === "CLEAN" || status === "HAS_HOOKS" || status === "UNSTABLE") return "PR can merge now: merge it instead"
  return null
}

function enqueueRefusal(prInfo: PrInfo): string | null {
  if (prInfo.state !== "open") return `PR is ${prInfo.state}`
  if (prInfo.isDraft) return "PR is a draft: mark it ready first"
  if (!prInfo.mergeQueue) return `${prInfo.baseRef} has no merge queue`
  if (prInfo.mergeQueue.inQueue) return "PR is already in the queue"
  if (prInfo.autoMergeMethod) return "PR joins the queue once checks pass"
  return null
}

function withPr(
  ctx: AutoMergeContext,
  decide: (prInfo: PrInfo) => { refusal: string | null; action: () => Action }
): void {
  const { prInfo } = ctx.getState()
  if (!prInfo) return

  const { refusal, action } = decide(prInfo)
  if (refusal !== null) {
    flash(ctx, refusal, "info", 2500)
    return
  }

  const chosen = action()
  ctx.confirm.show({
    title: chosen.title,
    message: chosen.message,
    details: chosen.command.join(" "),
    onConfirm: () => {
      ctx.confirm.close()
      void send(ctx, prInfo, chosen)
    },
    onCancel: () => {
      ctx.confirm.close()
      ctx.render()
    },
  })
  ctx.render()
}

async function send(ctx: AutoMergeContext, prInfo: PrInfo, action: Action): Promise<void> {
  const { owner, repo, number } = prInfo
  patchSamePr(ctx, prInfo, action.patch)
  ctx.render()

  const result = await action.run()
  if (!result.success) {
    patchSamePr(ctx, prInfo, action.revert)
    flash(ctx, `Error: ${result.error}`, "error", 3000)
    return
  }

  flash(ctx, action.done, "success", 2000)

  // The local patch already holds, so a refetch that fails changes nothing
  // the reader needs to hear about.
  const fresh = await ctx.sources.fetchPrInfo(owner, repo, number).catch(() => null)
  if (!fresh) return
  patchSamePr(ctx, prInfo, () => fresh)
  ctx.render()
}

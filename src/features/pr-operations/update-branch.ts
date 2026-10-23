/**
 * Bringing the PR's branch up to date with its base (spec 110), as the web's
 * Update branch button does. The palette offers it on any open PR; whether
 * the head is behind is decided here, where a toast can say why not. gh's
 * answer is the only word on the new head, so nothing is patched before it.
 */

import type { PrInfo } from "../../providers/github/types"
import { updateBranchCommand, updatePullRequestBranch, type UpdateMethod } from "../../providers/github/mutations"
import { fetchPrInfo } from "../../providers/github/session"
import type { BehindBy } from "../../components/merge-status-model"
import { flash, patchSamePr, prRef, type PrActionContext } from "./pr-action"

export interface UpdateBranchSources {
  updatePullRequestBranch: typeof updatePullRequestBranch
  fetchPrInfo: typeof fetchPrInfo
}

export const liveUpdateBranchSources: UpdateBranchSources = {
  updatePullRequestBranch,
  fetchPrInfo,
}

export type UpdateBranchContext = PrActionContext<UpdateBranchSources> & {
  behindBy(): BehindBy
  settleBehindBy(next: BehindBy): void
}

export function handleUpdateBranch(ctx: UpdateBranchContext): void {
  const { prInfo } = ctx.getState()
  if (!prInfo) return

  const behindBy = ctx.behindBy()
  const refusal = refusalOf(prInfo, behindBy)
  if (refusal !== null) {
    flash(ctx, refusal, "info", 2500)
    return
  }

  const { owner, repo, number, baseRef, headRef } = prInfo
  const count = typeof behindBy === "number" ? `, ${behindBy} commit${behindBy === 1 ? "" : "s"} behind` : ""
  const send = (method: UpdateMethod) => () => {
    ctx.confirm.close()
    void sendUpdate(ctx, prInfo, method)
  }

  ctx.confirm.show({
    title: "Update Branch",
    message: `${prRef(prInfo)} from ${baseRef}: merges ${baseRef} into ${headRef}${count}`,
    details: updateBranchCommand(owner, repo, number, "merge").join(" "),
    onConfirm: send("merge"),
    onCancel: () => {
      ctx.confirm.close()
      ctx.render()
    },
    alternative: {
      key: "r",
      label: `rebase onto ${baseRef} instead, rewriting ${headRef}'s history`,
      details: updateBranchCommand(owner, repo, number, "rebase").join(" "),
      onConfirm: send("rebase"),
    },
  })
  ctx.render()
}

function refusalOf(prInfo: PrInfo, behindBy: BehindBy): string | null {
  if (prInfo.state !== "open") return `PR is ${prInfo.state}`
  const behind = prInfo.mergeStateStatus === "BEHIND" || (typeof behindBy === "number" && behindBy > 0)
  if (behind) return null
  if (behindBy === 0) return `Up to date with ${prInfo.baseRef}`
  return `Not known to be behind ${prInfo.baseRef} yet`
}

function samePr(a: PrInfo | null, b: PrInfo): boolean {
  return a !== null && a.number === b.number && a.owner === b.owner && a.repo === b.repo
}

async function sendUpdate(ctx: UpdateBranchContext, prInfo: PrInfo, method: UpdateMethod): Promise<void> {
  const { owner, repo, number, baseRef } = prInfo
  const result = await ctx.sources.updatePullRequestBranch(owner, repo, number, method)
  if (!result.success) {
    flash(ctx, `Error: ${result.error}`, "error", 3000)
    return
  }

  if (samePr(ctx.getState().prInfo, prInfo)) ctx.settleBehindBy(0)
  flash(ctx, method === "rebase" ? `Branch rebased onto ${baseRef}` : `Branch updated from ${baseRef}`, "success", 2000)

  // The new head's checks and merge state come with the refetch; one that
  // fails leaves the panel's old reading until the next refresh.
  const fresh = await ctx.sources.fetchPrInfo(owner, repo, number).catch(() => null)
  if (!fresh) return
  patchSamePr(ctx, prInfo, () => fresh)
  ctx.render()
}

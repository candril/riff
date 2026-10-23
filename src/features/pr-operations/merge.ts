/**
 * Merging the pull request with a method the repository allows (spec 110).
 * The palette offers a method whatever GitHub thinks of the PR, so the
 * refusal lands here, where a toast can say why. A merge cannot be taken
 * back, so the reader confirms the exact command first.
 */

import type { MergeMethod, PrInfo } from "../../providers/github/types"
import { mergeCommand, mergePullRequest, type MergeOptions } from "../../providers/github/mutations"
import { fetchPrInfo } from "../../providers/github/session"
import { mergeReading } from "../../utils/merge-verdict"
import type { AppState } from "../../state"
import { flash, patchSamePr, prRef, type PrActionContext } from "./pr-action"

export interface MergeSources {
  mergePullRequest: typeof mergePullRequest
  fetchPrInfo: typeof fetchPrInfo
}

export const liveMergeSources: MergeSources = {
  mergePullRequest,
  fetchPrInfo,
}

export type MergeContext = PrActionContext<MergeSources>

const TITLES: Record<MergeMethod, string> = {
  squash: "Squash and Merge",
  merge: "Create a Merge Commit",
  rebase: "Rebase and Merge",
}

export function handleMerge(ctx: MergeContext, method: MergeMethod): void {
  const state = ctx.getState()
  const { prInfo } = state
  if (!prInfo) return

  const verdict = mergeVerdict(state, prInfo, method)
  if (verdict.refusal !== null) {
    flash(ctx, verdict.refusal, "info", 2500)
    return
  }

  const { owner, repo, number } = prInfo
  const keep: MergeOptions = { method, deleteBranch: false, admin: verdict.admin }
  const notes = [
    verdict.admin ? `bypasses ${prInfo.baseRef}'s branch protection` : null,
    prInfo.deleteBranchOnMerge ? "the repository deletes the branch" : null,
  ].filter((note) => note !== null)
  const offerDelete = prInfo.deleteBranchOnMerge === false

  ctx.confirm.show({
    title: TITLES[method],
    message: `${prRef(prInfo)} into ${prInfo.baseRef}${notes.length > 0 ? `: ${notes.join("; ")}` : ""}`,
    details: mergeCommand(owner, repo, number, keep).join(" "),
    onConfirm: () => {
      ctx.confirm.close()
      void sendMerge(ctx, prInfo, keep)
    },
    onCancel: () => {
      ctx.confirm.close()
      ctx.render()
    },
    ...(offerDelete
      ? {
          alternative: {
            key: "d",
            label: "merge and delete the branch",
            details: mergeCommand(owner, repo, number, { ...keep, deleteBranch: true }).join(" "),
            onConfirm: () => {
              ctx.confirm.close()
              void sendMerge(ctx, prInfo, { ...keep, deleteBranch: true })
            },
          },
        }
      : {}),
  })
  ctx.render()
}

type Verdict = { refusal: string } | { refusal: null; admin: boolean }

function mergeVerdict(state: AppState, prInfo: PrInfo, method: MergeMethod): Verdict {
  if (prInfo.state !== "open") return { refusal: `PR is ${prInfo.state}` }
  if (prInfo.isDraft) return { refusal: "PR is a draft: mark it ready first" }
  if (!prInfo.mergeMethods?.includes(method)) return { refusal: `${method} merges are off in ${prInfo.owner}/${prInfo.repo}` }
  if (prInfo.mergeQueue) return { refusal: `${prInfo.baseRef} merges through a queue` }

  const status = prInfo.mergeStateStatus
  if (status === "CLEAN" || status === "HAS_HOOKS" || status === "UNSTABLE") return { refusal: null, admin: false }
  if (status === "BLOCKED" && prInfo.viewerCanMergeAsAdmin) return { refusal: null, admin: true }

  // The header's own words, so the toast never contradicts what sits above it.
  return { refusal: `Can't merge: ${mergeReading(prInfo, prInfo.checks ?? [], state.comments).text}` }
}

async function sendMerge(ctx: MergeContext, prInfo: PrInfo, options: MergeOptions): Promise<void> {
  const { owner, repo, number } = prInfo
  patchSamePr(ctx, prInfo, (current) => ({ ...current, state: "merged" }))
  ctx.render()

  const result = await ctx.sources.mergePullRequest(owner, repo, number, options)
  if (!result.success) {
    patchSamePr(ctx, prInfo, (current) => ({ ...current, state: prInfo.state }))
    flash(ctx, `Error: ${result.error}`, "error", 3000)
    return
  }

  flash(ctx, options.deleteBranch ? "PR merged, branch deleted" : "PR merged", "success", 2000)

  // The local "merged" already holds, so a refetch that fails changes
  // nothing the reader needs to hear about.
  const fresh = await ctx.sources.fetchPrInfo(owner, repo, number).catch(() => null)
  if (!fresh) return
  patchSamePr(ctx, prInfo, () => fresh)
  ctx.render()
}

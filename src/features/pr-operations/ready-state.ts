/**
 * Marking the pull request ready for review, or back to draft (spec 110).
 * It is a write to GitHub, so the reader confirms the exact command first;
 * the flip shows at once and is put back if gh refuses it. gh and the
 * refetch come in as sources, so a test can run it with neither.
 */

import type { PrInfo } from "../../providers/github/types"
import { markPullRequestDraft, markPullRequestReady, readyCommand } from "../../providers/github/mutations"
import { fetchPrInfo } from "../../providers/github/session"
import { flash, patchSamePr, prRef, type PrActionContext } from "./pr-action"

export interface ReadyStateSources {
  markPullRequestReady: typeof markPullRequestReady
  markPullRequestDraft: typeof markPullRequestDraft
  fetchPrInfo: typeof fetchPrInfo
}

export const liveReadyStateSources: ReadyStateSources = {
  markPullRequestReady,
  markPullRequestDraft,
  fetchPrInfo,
}

export type ReadySends = ReturnType<typeof createReadySends>

/**
 * Numbers each send and counts the ones gh has not answered. Only the last
 * to be answered refetches: with an older send still out, GitHub's answer
 * could be overtaken by that send landing after it.
 */
export function createReadySends() {
  let latest = 0
  let inFlight = 0
  return {
    begin: () => {
      inFlight++
      return ++latest
    },
    /** True once no send is left in flight. */
    settle: () => --inFlight === 0,
    current: () => latest,
    isLatest: (send: number) => send === latest,
  }
}

export type ReadyStateContext = PrActionContext<ReadyStateSources> & { sends: ReadySends }

export function handleToggleReady(ctx: ReadyStateContext): void {
  const { prInfo } = ctx.getState()
  if (!prInfo) return
  if (prInfo.state !== "open") {
    flash(ctx, `PR is ${prInfo.state}`, "info", 2000)
    return
  }

  const toDraft = !prInfo.isDraft
  const ref = prRef(prInfo)
  ctx.confirm.show({
    title: toDraft ? "Convert to Draft" : "Mark Ready for Review",
    message: toDraft
      ? `${ref}: the PR can't merge until it's marked ready again`
      : `${ref}: reviewers are notified and the PR can merge`,
    details: readyCommand(prInfo.owner, prInfo.repo, prInfo.number, toDraft).join(" "),
    onConfirm: () => {
      ctx.confirm.close()
      void sendReady(ctx, prInfo, toDraft)
    },
    onCancel: () => {
      ctx.confirm.close()
      ctx.render()
    },
  })
  ctx.render()
}

async function sendReady(ctx: ReadyStateContext, prInfo: PrInfo, toDraft: boolean): Promise<void> {
  const { owner, repo, number } = prInfo
  const send = ctx.sends.begin()
  patchSamePr(ctx, prInfo, (current) => ({ ...current, isDraft: toDraft }))
  ctx.render()

  const mark = toDraft ? ctx.sources.markPullRequestDraft : ctx.sources.markPullRequestReady
  const result = await mark(owner, repo, number)
  if (result.success) {
    flash(ctx, toDraft ? "PR converted to draft" : "PR marked ready for review", "success", 2000)
  } else {
    // An older send's value would be stale here; the refetch settles it.
    if (ctx.sends.isLatest(send)) patchSamePr(ctx, prInfo, (current) => ({ ...current, isDraft: prInfo.isDraft }))
    flash(ctx, `Error: ${result.error}`, "error", 3000)
  }
  if (!ctx.sends.settle()) return

  const asked = ctx.sends.current()
  // The local value already holds, so a refetch that fails changes nothing
  // the reader needs to hear about.
  const fresh = await ctx.sources.fetchPrInfo(owner, repo, number).catch(() => null)
  // A toggle sent since has flipped isDraft; this answer would write it back.
  if (!fresh || !ctx.sends.isLatest(asked)) return
  patchSamePr(ctx, prInfo, () => fresh)
  ctx.render()
}

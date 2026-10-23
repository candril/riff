/**
 * Marking the pull request ready for review, or back to draft (spec 110).
 * It is a write to GitHub, so the reader confirms the exact command first;
 * the flip shows at once and is put back if gh refuses it. gh and the
 * refetch come in as sources, so a test can run it with neither.
 */

import type { AppState } from "../../state"
import type { PrInfo } from "../../providers/github/types"
import { markPullRequestDraft, markPullRequestReady, readyCommand } from "../../providers/github/mutations"
import { fetchPrInfo } from "../../providers/github/session"
import type { ConfirmState } from "../confirm/state"
import type { ToastState } from "../toast/state"

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

export interface ReadyStateContext {
  sources: ReadyStateSources
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  confirm: Pick<ConfirmState, "show" | "close">
  toast: Pick<ToastState, "show" | "clear">
  /** Draws, after handing the PR info panel the state's current prInfo. */
  render: () => void
  later: (fn: () => void, ms: number) => void
}

export function handleToggleReady(ctx: ReadyStateContext): void {
  const { prInfo } = ctx.getState()
  if (!prInfo) return
  if (prInfo.state !== "open") {
    flash(ctx, `PR is ${prInfo.state}`, "info", 2000)
    return
  }

  const toDraft = !prInfo.isDraft
  const ref = `${prInfo.owner}/${prInfo.repo}#${prInfo.number}`
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
  patchSamePr(ctx, prInfo, (current) => ({ ...current, isDraft: toDraft }))
  ctx.render()

  const mark = toDraft ? ctx.sources.markPullRequestDraft : ctx.sources.markPullRequestReady
  const result = await mark(owner, repo, number)
  if (!result.success) {
    patchSamePr(ctx, prInfo, (current) => ({ ...current, isDraft: prInfo.isDraft }))
    flash(ctx, `Error: ${result.error}`, "error", 3000)
    return
  }

  flash(ctx, toDraft ? "PR converted to draft" : "PR marked ready for review", "success", 2000)

  // The local flip already holds, so a refetch that fails changes nothing
  // the reader needs to hear about.
  const fresh = await ctx.sources.fetchPrInfo(owner, repo, number).catch(() => null)
  if (!fresh) return
  patchSamePr(ctx, prInfo, () => fresh)
  ctx.render()
}

/** riff may have moved on to another PR while gh was awaited; that PR stays as it is. */
function patchSamePr(ctx: ReadyStateContext, prInfo: PrInfo, patch: (current: PrInfo) => PrInfo): void {
  ctx.setState((s) => {
    const current = s.prInfo
    if (!current || current.number !== prInfo.number || current.owner !== prInfo.owner || current.repo !== prInfo.repo) return s
    return { ...s, prInfo: patch(current) }
  })
}

function flash(ctx: ReadyStateContext, message: string, type: "info" | "success" | "error", ms: number): void {
  ctx.toast.show(message, type)
  ctx.render()
  ctx.later(() => {
    ctx.toast.clear()
    ctx.render()
  }, ms)
}

/**
 * What the PR actions of spec 110 share: each asks first, patches the PR in
 * at once, awaits gh, and patches it back if gh refuses. The sources differ
 * per action and come in from outside, so a test runs with no gh at all.
 */

import type { AppState } from "../../state"
import type { PrInfo } from "../../providers/github/types"
import type { ConfirmState } from "../confirm/state"
import type { ToastState } from "../toast/state"

export interface PrActionContext<Sources> {
  sources: Sources
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  confirm: Pick<ConfirmState, "show" | "close">
  toast: Pick<ToastState, "show" | "clear">
  /** Draws, after handing the PR info panel the state's current prInfo. */
  render: () => void
  later: (fn: () => void, ms: number) => void
}

export function prRef(prInfo: Pick<PrInfo, "owner" | "repo" | "number">): string {
  return `${prInfo.owner}/${prInfo.repo}#${prInfo.number}`
}

/** riff may have moved on to another PR while gh was awaited; that PR stays as it is. */
export function patchSamePr(
  ctx: Pick<PrActionContext<unknown>, "setState">,
  prInfo: PrInfo,
  patch: (current: PrInfo) => PrInfo
): void {
  ctx.setState((s) => {
    const current = s.prInfo
    if (!current || current.number !== prInfo.number || current.owner !== prInfo.owner || current.repo !== prInfo.repo) return s
    return { ...s, prInfo: patch(current) }
  })
}

export function flash(
  ctx: Pick<PrActionContext<unknown>, "toast" | "render" | "later">,
  message: string,
  type: "info" | "success" | "error",
  ms: number
): void {
  ctx.toast.show(message, type)
  ctx.render()
  ctx.later(() => {
    ctx.toast.clear()
    ctx.render()
  }, ms)
}

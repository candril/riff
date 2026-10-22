/**
 * riff board — the user's separate web app for a PR's review. riff only
 * builds the board's URL for the current PR and hands it to the browser.
 */

import { type AppState } from "../../state"
import type { DiffTarget } from "../permalink"
import type { ToastType } from "../../components/notification-model"
import type { ToastState } from "../toast/state"

export interface BoardPr {
  owner: string
  repo: string
  number: number
}

/**
 * Where in the PR the reader is. A removed line has no new-side number, so
 * it is sent by its old-side one and says so.
 */
export interface BoardLocation {
  file: string
  line?: number
  side?: "old"
}

/**
 * The query is extra: a board that does not read it still lands on the PR,
 * so the path stays the same with or without one. encodeURIComponent rather
 * than URLSearchParams, which would write a space as `+`.
 */
export function boardPrUrl(base: string, pr: BoardPr, location?: BoardLocation | null): string {
  const path = `${base.replace(/\/+$/, "")}/pr/${pr.owner}/${pr.repo}/${pr.number}`
  if (!location) return path
  let query = `?file=${encodeURIComponent(location.file)}`
  if (location.line !== undefined) query += `&line=${location.line}`
  if (location.line !== undefined && location.side) query += `&side=${location.side}`
  return path + query
}

/**
 * Only the diff and the file tree point at a file; the overview, the feed
 * and the thread panel are about the PR as a whole. The view is checked
 * before the target because the permalink resolver hands back a file in any
 * view.
 */
export function boardLocation(state: AppState, target: DiffTarget | null): BoardLocation | null {
  if (state.viewMode !== "diff" || !target) return null
  if (state.focusedPanel === "tree") return { file: target.filename }
  if (state.focusedPanel !== "diff") return null
  if (target.line === undefined) return { file: target.filename }
  return target.side === "LEFT"
    ? { file: target.filename, line: target.line, side: "old" }
    : { file: target.filename, line: target.line }
}

export interface RiffBoardContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
  openUrl: (url: string) => boolean
  boardUrl: string
  location: () => BoardLocation | null
}

/**
 * The server is never probed: when it is down the browser's connection
 * error says so, and riff stays out of the board's lifecycle.
 */
export function openPrInBoard(ctx: RiffBoardContext): void {
  const { appMode, prInfo } = ctx.getState()
  if (appMode !== "pr" || !prInfo) {
    // The board is keyed by PR, so a local or range review has no page there.
    flash(ctx, "riff board opens GitHub PRs only", "info")
    return
  }
  const url = boardPrUrl(ctx.boardUrl, prInfo, ctx.location())
  if (!ctx.openUrl(url)) {
    flash(ctx, `Could not open riff board: ${url}`, "error")
  }
}

function flash(ctx: RiffBoardContext, message: string, type: ToastType): void {
  ctx.toast.show(message, type)
  ctx.render()
  setTimeout(() => {
    ctx.toast.clear()
    ctx.render()
  }, 2000)
}

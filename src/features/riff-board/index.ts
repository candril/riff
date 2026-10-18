/**
 * riff board — the user's separate web app for a PR's review. riff only
 * builds the board's URL for the current PR and hands it to the browser.
 */

import { showToast, clearToast, type AppState } from "../../state"

export interface BoardPr {
  owner: string
  repo: string
  number: number
}

export function boardPrUrl(base: string, pr: BoardPr): string {
  return `${base.replace(/\/+$/, "")}/pr/${pr.owner}/${pr.repo}/${pr.number}`
}

export interface RiffBoardContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  openUrl: (url: string) => boolean
  boardUrl: string
}

/**
 * The server is never probed: when it is down the browser's connection
 * error says so, and riff stays out of the board's lifecycle.
 */
export function openPrInBoard(ctx: RiffBoardContext): void {
  const { appMode, prInfo } = ctx.getState()
  if (appMode !== "pr" || !prInfo) {
    // The board is keyed by PR, so a local or range review has no page there.
    flash(ctx, (s) => showToast(s, "riff board opens GitHub PRs only", "info"))
    return
  }
  const url = boardPrUrl(ctx.boardUrl, prInfo)
  if (!ctx.openUrl(url)) {
    flash(ctx, (s) => showToast(s, `Could not open riff board: ${url}`, "error"))
  }
}

function flash(ctx: RiffBoardContext, show: (s: AppState) => AppState): void {
  ctx.setState(show)
  ctx.render()
  setTimeout(() => {
    ctx.setState(clearToast)
    ctx.render()
  }, 2000)
}

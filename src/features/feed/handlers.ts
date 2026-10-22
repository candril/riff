/**
 * Loading the feed (spec 070).
 *
 * The timeline is one paginated REST call and the only source that reports a
 * force-push; the checks and comments are already in hand. It is fetched when
 * the feed is first opened and again on refresh — not on arrival, so a PR you
 * never ask about costs nothing.
 */

import type { AppState } from "../../state"
import type { ActivityFeedState } from "./state"
import { fetchPrTimeline } from "../../providers/github/lookups"
import { fetchCommitDiff } from "../../providers/github/diff"
import { buildFeed } from "../../utils/feed"
import { parseDiff } from "../../utils/diff-parser"

export interface FeedLoadContext {
  getState: () => AppState
  feed: Pick<ActivityFeedState, "startLoading" | "setEvents" | "setCommitFiles">
  render: () => void
}

export async function loadFeed(ctx: FeedLoadContext): Promise<void> {
  const state = ctx.getState()
  if (state.appMode !== "pr" || !state.prInfo) return

  ctx.feed.startLoading()
  ctx.render()

  const { owner, repo, number } = state.prInfo
  const timeline = await fetchPrTimeline(owner, repo, number)

  const current = ctx.getState()
  ctx.feed.setEvents(
    buildFeed({
      timeline,
      comments: current.comments,
      checks: current.prInfo?.checks ?? [],
      commits: current.commits,
      prInfo: current.prInfo,
    })
  )
  ctx.render()
}

/**
 * The files one commit touched, for a row that was just expanded. Read off
 * the commit's own diff, which riff can already fetch.
 */
export async function loadCommitFiles(ctx: FeedLoadContext, sha: string): Promise<void> {
  const state = ctx.getState()
  if (!state.prInfo) return

  const diff = await fetchCommitDiff(state.prInfo.owner, state.prInfo.repo, sha)
  if (!diff) return

  const files = parseDiff(diff).map((file) => ({
    filename: file.filename,
    additions: file.additions,
    deletions: file.deletions,
  }))
  ctx.feed.setCommitFiles(sha, files)
  ctx.render()
}

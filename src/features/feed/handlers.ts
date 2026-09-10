/**
 * Loading the feed (spec 070).
 *
 * The timeline is one paginated REST call and the only source that reports a
 * force-push; the checks and comments are already in hand. It is fetched when
 * the feed is first opened and again on refresh — not on arrival, so a PR you
 * never ask about costs nothing.
 */

import type { AppState } from "../../state"
import { setFeedEvents, setFeedCommitFiles } from "../../state"
import { fetchPrTimeline, fetchCommitDiff } from "../../providers/github"
import { buildFeed } from "../../utils/feed"
import { parseDiff } from "../../utils/diff-parser"

export interface FeedLoadContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
}

export async function loadFeed(ctx: FeedLoadContext): Promise<void> {
  const state = ctx.getState()
  if (state.appMode !== "pr" || !state.prInfo) return

  ctx.setState((s) => ({ ...s, feed: { ...s.feed, loading: true } }))
  ctx.render()

  const { owner, repo, number } = state.prInfo
  const timeline = await fetchPrTimeline(owner, repo, number)

  ctx.setState((s) =>
    setFeedEvents(
      s,
      buildFeed({
        timeline,
        comments: s.comments,
        checks: s.prInfo?.checks ?? [],
        commits: s.commits,
        prInfo: s.prInfo,
      })
    )
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
  ctx.setState((s) => setFeedCommitFiles(s, sha, files))
  ctx.render()
}

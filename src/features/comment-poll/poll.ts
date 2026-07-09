/**
 * Background poll for new / updated PR review comments.
 *
 * The pain this solves: while you're reviewing, teammates post replies on
 * existing threads (or new review comments). Without a live refresh those
 * only appear on a manual `gR`, so it's easy to reply to a stale thread.
 *
 * This poller ticks every POLL_MS while in PR mode, fetches just the review
 * comments (cheap — no diff / checks / reviews, no disk I/O), and merges
 * them into `state.comments`. The inline comment overlay and comments panel
 * both derive their threads from `state.comments` on every render, so a
 * plain `setState` + `render()` is all it takes to surface new replies.
 *
 * Deliberately silent: no toast, no banner (per request) — the UI just
 * updates. Cursor, folds, scroll, and selection are untouched because we
 * only swap the `comments` array; everything else keys off the same state.
 */

import type { Comment } from "../../types"
import type { PrInfo } from "../../providers/github"
import type { AppMode } from "../../types"
import type { AppState } from "../../state"
import { fetchPrReviewComments } from "../../providers/github"

// GitHub-side comment activity changes on the order of minutes; a 60s tick
// keeps replies current without hammering the API. Matches the interval the
// user asked for.
const POLL_MS = 60_000

export interface CommentPollContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  // Rebuild the persistent PR info panel so its per-file comment counts pick
  // up the new comments. The panel caches comments internally, so it can't
  // see a `state.comments` swap on its own.
  recreatePrInfoPanel: () => void
  mode: AppMode
  prInfo: PrInfo | null
  headSha: string
}

/**
 * A stable fingerprint of the fetched GitHub comments — id, body, resolution,
 * outdated flag, and reaction counts. Two ticks with the same signature mean
 * nothing user-visible changed, so we skip the re-render entirely.
 */
function signature(comments: Comment[]): string {
  return comments
    .map((c) => {
      const reactions = (c.reactions ?? [])
        .map((r) => `${r.content}:${r.count}`)
        .join(",")
      return `${c.githubId}|${c.body.length}|${c.isThreadResolved ? 1 : 0}|${c.outdated ? 1 : 0}|${reactions}`
    })
    .sort()
    .join("\n")
}

/**
 * Merge freshly-fetched GitHub comments into the current comment list,
 * preserving local comments that aren't on GitHub yet (unsubmitted drafts).
 *
 * Mirrors `loadPrSession`'s merge: drop any local comment whose `githubId`
 * is now in the fetched set (it's been synced and the GitHub copy wins),
 * keep the rest, then append all fetched comments and re-sort by time.
 */
function mergeComments(existing: Comment[], fetched: Comment[]): Comment[] {
  const fetchedGithubIds = new Set(fetched.map((c) => c.githubId))
  const local = existing.filter((c) => !c.githubId || !fetchedGithubIds.has(c.githubId))
  return [...local, ...fetched].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * True while the user is actively composing or editing a comment. Swapping
 * the comment list out from under an open composer risks shifting the
 * highlighted row, so we defer applying updates until they're back to
 * viewing. The fetch still happens; we just hold the result for next tick.
 */
function isComposing(state: AppState): boolean {
  if (state.commentInputLine !== null) return true
  const overlay = state.inlineCommentOverlay
  if (overlay.open && overlay.mode !== "view") return true
  if (state.prInfoPanel.commentInputOpen) return true
  return false
}

/**
 * Start the background comment poller. Returns a `stop` function; `app.ts`
 * doesn't currently need it (the TUI is process-lifetime), but it keeps the
 * poller symmetrical with the draft poller and testable.
 *
 * No-op per tick when not in PR mode, so calling it unconditionally is safe.
 */
export function startCommentPoll(ctx: CommentPollContext): () => void {
  let lastSig: string | null = null
  let inFlight = false

  const tick = async (): Promise<void> => {
    if (ctx.mode !== "pr" || !ctx.prInfo) return
    // Skip overlapping ticks if a fetch is slow — no point queueing gh calls.
    if (inFlight) return
    inFlight = true

    try {
      const { owner, repo, number } = ctx.prInfo
      const fetched = await fetchPrReviewComments(owner, repo, number, ctx.headSha)

      const sig = signature(fetched)
      if (sig === lastSig) return

      // Don't clobber an open composer; retry on a later tick by leaving
      // lastSig untouched so the change is still considered "new".
      if (isComposing(ctx.getState())) return

      lastSig = sig
      ctx.setState((s) => ({ ...s, comments: mergeComments(s.comments, fetched) }))

      // Refresh the PR info panel's cached counts, but not while it's the
      // active view — recreating it would jump the user's scroll position.
      if (ctx.getState().viewMode !== "pr") {
        ctx.recreatePrInfoPanel()
      }

      ctx.render()
    } catch {
      // Transient gh/network failure — swallow and try again next tick.
    } finally {
      inFlight = false
    }
  }

  const id = setInterval(tick, POLL_MS)

  // Don't let the poller hold the event loop open on exit.
  if (typeof (id as { unref?: () => void }).unref === "function") {
    ;(id as { unref: () => void }).unref()
  }

  return () => clearInterval(id)
}

/**
 * Background poll for new / updated PR review comments.
 *
 * The pain this solves: while you're reviewing, teammates post replies on
 * existing threads (or new review comments). Without a live refresh those
 * only appear on a manual `gR`, so it's easy to reply to a stale thread.
 *
 * The poller fetches just the review comments (no diff / checks / reviews, no
 * disk I/O) and merges them into `state.comments`. The inline comment overlay
 * and comments panel both derive their threads from `state.comments` on every
 * render, so a plain `setState` + `render()` is all it takes to surface new
 * replies.
 *
 * Being on a timer makes cost the dominant design constraint. Three things
 * keep it cheap:
 *
 *  - The GraphQL thread query runs at probe depth. GitHub prices a query by
 *    its nested node count, and the full-depth version costs 51 of the 5000
 *    hourly points — 3060/hour at a 60s tick, before the user does anything.
 *    Probe depth costs 2.
 *  - A conditional REST request decides whether comment bodies are worth
 *    re-fetching at all. A 304 is free against the rate limit.
 *  - Ticks are skipped while the terminal is unfocused, and a focused tick is
 *    triggered on focus-in instead.
 *
 * Deliberately silent: no toast, no banner (per request) — the UI just
 * updates. Cursor, folds, scroll, and selection are untouched because we
 * only swap the `comments` array; everything else keys off the same state.
 */

import type { Comment } from "../../types"
import type { PrInfo } from "../../providers/github"
import type { AppMode } from "../../types"
import type { AppState } from "../../state"
import {
  fetchPrReviewComments,
  getPrThreadStates,
  THREAD_COMMENTS_PROBE,
} from "../../providers/github"
import { reviewCommentsChanged } from "../../providers/rest"

/** Fallback when config carries no interval. See `PollConfig.interval`. */
const DEFAULT_POLL_SECONDS = 300

/**
 * How stale data must be before a focus-in triggers an off-schedule refresh.
 * Without a floor, alt-tabbing between two panes would refetch on every
 * switch.
 */
const FOCUS_REFRESH_STALE_MS = 30_000

export interface CommentPollContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /** Seconds between ticks; 0 disables the timer. */
  intervalSeconds?: number
  /**
   * Whether to gate ticks on terminal focus. When true the caller must also
   * drive `setFocused` on the returned handle — otherwise riff would sit on
   * an assumed-unfocused terminal and never poll.
   */
  onFocus?: boolean
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
export function mergeComments(existing: Comment[], fetched: Comment[]): Comment[] {
  const fetchedGithubIds = new Set(fetched.map((c) => c.githubId))
  const local = existing.filter((c) => !c.githubId || !fetchedGithubIds.has(c.githubId))

  // The poller queries threads at probe depth, so only roots come back with
  // reactions; replies arrive with an empty list. Keep whatever the last full
  // fetch established rather than blanking reaction pills every tick. A
  // genuinely new reply has nothing to carry over, which is correct — it has
  // no reactions yet.
  const reactionsByGithubId = new Map(
    existing
      .filter((c) => c.githubId && (c.reactions?.length ?? 0) > 0)
      .map((c) => [c.githubId, c.reactions]),
  )
  const restored = fetched.map((c) =>
    (c.reactions?.length ?? 0) === 0 && reactionsByGithubId.has(c.githubId)
      ? { ...c, reactions: reactionsByGithubId.get(c.githubId) }
      : c,
  )

  return [...local, ...restored].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Apply thread resolution/outdated state onto the comments already in state.
 * Returns the same array when nothing moved, so callers can skip the render.
 */
export function applyThreadStates(
  comments: Comment[],
  states: { rootCommentId: number; isResolved: boolean; isOutdated: boolean }[],
): Comment[] {
  if (states.length === 0) return comments
  const byRoot = new Map(states.map((t) => [t.rootCommentId, t]))

  let changed = false
  const next = comments.map((c) => {
    const state = c.githubId ? byRoot.get(c.githubId) : undefined
    if (!state) return c
    if (c.isThreadResolved === state.isResolved && c.outdated === state.isOutdated) return c
    changed = true
    return { ...c, isThreadResolved: state.isResolved, outdated: state.isOutdated }
  })

  return changed ? next : comments
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
 * Handle for a running poller.
 */
export interface CommentPollHandle {
  stop: () => void
  /**
   * Report a terminal focus change. Focus-in triggers an immediate tick when
   * the data has gone stale, so coming back to riff shows current comments
   * without waiting out the interval.
   */
  setFocused: (focused: boolean) => void
}

/**
 * Start the background comment poller.
 *
 * No-op per tick when not in PR mode, so calling it unconditionally is safe.
 * An interval of 0 starts no timer at all — `gr` still refreshes on demand.
 */
export function startCommentPoll(ctx: CommentPollContext): CommentPollHandle {
  let lastSig: string | null = null
  let inFlight = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastTickAt = 0
  // Terminals without focus reporting never send an event, so the only safe
  // starting assumption is that the user is looking at us.
  let focused = true

  const intervalMs = (ctx.intervalSeconds ?? DEFAULT_POLL_SECONDS) * 1000

  /**
   * Pull comment bodies and thread metadata, and merge. Costs a probe-depth
   * GraphQL query plus the paginated REST comment list.
   */
  const refetchComments = async (): Promise<void> => {
    const { owner, repo, number } = ctx.prInfo!
    const fetched = await fetchPrReviewComments(
      owner,
      repo,
      number,
      ctx.headSha,
      THREAD_COMMENTS_PROBE,
    )

    const sig = signature(fetched)
    const changed = sig !== lastSig

    // Don't clobber an open composer; retry on a later tick by leaving
    // lastSig untouched so the change is still considered "new".
    if (isComposing(ctx.getState())) return

    if (changed) {
      lastSig = sig
      ctx.setState((s) => ({ ...s, comments: mergeComments(s.comments, fetched) }))

      // Refresh the PR info panel's cached counts, but not while it's the
      // active view — recreating it would jump the user's scroll position.
      if (ctx.getState().viewMode !== "pr") {
        ctx.recreatePrInfoPanel()
      }
    }
  }

  /**
   * Cheap path for when comment bodies are untouched: only resolution and
   * outdated state can have moved, and that costs a single GraphQL point.
   */
  const refreshThreadStates = async (): Promise<void> => {
    const { owner, repo, number } = ctx.prInfo!
    const states = await getPrThreadStates(owner, repo, number)
    if (states.length === 0) return
    if (isComposing(ctx.getState())) return

    ctx.setState((s) => {
      const comments = applyThreadStates(s.comments, states)
      return comments === s.comments ? s : { ...s, comments }
    })
    if (ctx.getState().viewMode !== "pr") {
      ctx.recreatePrInfoPanel()
    }
  }

  const tick = async (): Promise<void> => {
    if (ctx.mode !== "pr" || !ctx.prInfo) return
    // Skip overlapping ticks if a fetch is slow — no point queueing gh calls.
    if (inFlight) return
    // An unfocused terminal has nobody reading the result; focus-in will
    // catch up. Only honoured when the caller opted in and is feeding us
    // focus events.
    if (ctx.onFocus && !focused) return

    inFlight = true
    lastTickAt = Date.now()

    try {
      const { owner, repo, number } = ctx.prInfo
      const probe = await reviewCommentsChanged(owner, repo, number)

      // Only a definite 304 licenses the cheap path. An errored probe fails
      // open — it can't distinguish "nothing changed" from a blocked direct
      // fetch or a GitHub Enterprise host the probe doesn't know about, and
      // silently never surfacing replies again is far worse than paying the
      // (now 2-point) refetch.
      if (probe.status === "unchanged") {
        await refreshThreadStates()
      } else {
        await refetchComments()
      }

      // Stamp "last refreshed" on every successful tick, changed or not, so
      // the header reflects that comments were confirmed current just now.
      ctx.setState((s) => ({ ...s, lastRefreshedAt: new Date().toISOString() }))
      ctx.render()
    } catch {
      // Transient gh/network failure — swallow and try again next tick.
    } finally {
      inFlight = false
    }
  }

  /**
   * Chained rather than `setInterval`: a fetch slower than the interval would
   * otherwise queue ticks behind itself, and the spacing should be measured
   * from when the last one finished.
   */
  const scheduleNext = (): void => {
    if (intervalMs <= 0) return
    timer = setTimeout(() => {
      void tick().finally(scheduleNext)
    }, intervalMs)
    // Don't let the poller hold the event loop open on exit.
    if (typeof (timer as { unref?: () => void }).unref === "function") {
      ;(timer as unknown as { unref: () => void }).unref()
    }
  }

  scheduleNext()

  return {
    stop: () => {
      if (timer) clearTimeout(timer)
      timer = null
    },
    setFocused: (next: boolean) => {
      const regained = next && !focused
      focused = next
      if (!regained || intervalMs <= 0) return
      // Only interrupt the schedule when the data is actually old; otherwise
      // switching back and forth between two panes would refetch each time.
      if (Date.now() - lastTickAt < FOCUS_REFRESH_STALE_MS) return
      void tick()
    },
  }
}

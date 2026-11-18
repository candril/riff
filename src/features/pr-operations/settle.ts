/**
 * Bringing the PR info back in line with GitHub after riff acted on the PR.
 *
 * One refetch is not enough: GitHub works out the merge state, the required
 * reviews and whether the queue takes the PR in the background, so the
 * answer right after an approval or an enqueue still reads the old verdict
 * for a few seconds. The settler fetches again on a short ladder, and a new
 * action starts the ladder over. Each fetch is the PR bundle, 54 points, so
 * an action costs a few hundred of the 5000 hourly; nothing here runs on a
 * timer of its own.
 */

import type { AppState } from "../../state"
import type { PrInfo } from "../../providers/github/types"
import type { fetchPrInfo } from "../../providers/github/session"

/** Milliseconds after the action, measured from the action, not each other. */
export const SETTLE_DELAYS_MS = [0, 3_000, 10_000, 30_000] as const

export interface PrInfoSettlerDeps {
  fetchPrInfo: typeof fetchPrInfo
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  /** Draws, after handing the PR info panel the state's current prInfo. */
  render: () => void
  /** Runs `fn` after `ms`; returns what cancels it. */
  later: (fn: () => void, ms: number) => () => void
}

export interface PrInfoSettler {
  /**
   * `"later"` skips the immediate fetch, for an action that has just
   * refetched on its own.
   */
  settle: (prInfo: PrInfo, from?: "now" | "later") => void
  stop: () => void
}

export function createPrInfoSettler(deps: PrInfoSettlerDeps, delays: readonly number[] = SETTLE_DELAYS_MS): PrInfoSettler {
  let cancels: (() => void)[] = []

  const stop = () => {
    for (const cancel of cancels) cancel()
    cancels = []
  }

  const fetchOnce = async (target: PrInfo): Promise<void> => {
    // Whatever replaces prInfo while the fetch is out (an optimistic patch,
    // another PR, a refresh) knows better than an answer asked before it.
    const asked = deps.getState().prInfo
    if (!asked || !samePr(asked, target)) return
    const fresh = await deps.fetchPrInfo(target.owner, target.repo, target.number).catch(() => null)
    if (!fresh || deps.getState().prInfo !== asked) return
    deps.setState((s) => ({ ...s, prInfo: fresh }))
    deps.render()
  }

  return {
    settle(prInfo, from = "now") {
      stop()
      for (const ms of delays) {
        if (ms === 0 && from === "later") continue
        if (ms === 0) {
          void fetchOnce(prInfo)
          continue
        }
        cancels.push(deps.later(() => void fetchOnce(prInfo), ms))
      }
    },
    stop,
  }
}

function samePr(a: PrInfo, b: PrInfo): boolean {
  return a.number === b.number && a.owner === b.owner && a.repo === b.repo
}

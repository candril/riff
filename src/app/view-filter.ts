/**
 * `Ctrl-f`, `/` and the filter prompt for whatever has focus (spec 065). The
 * feed and the PR overview keep their filters in factories of their own and
 * every other surface in AppState, so the callers that can stand in either
 * come through here.
 */

import {
  clearViewFilter,
  commitViewFilter,
  filterTarget,
  setViewFilter,
  startViewFilter,
  type AppState,
  type StateFilterTarget,
} from "../state"
import type { ActivityFeedState } from "../features/feed/state"
import type { PrInfoFilterState } from "../features/pr-info-panel/filter-state"

export interface ViewFilterContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  feed: Pick<ActivityFeedState, "startFilter" | "setFilter" | "commitFilter" | "clearFilter">
  prInfoFilter: Pick<PrInfoFilterState, "start" | "set" | "commit" | "clear">
}

interface Routes {
  feed: () => void
  overview: () => void
  state: (target: StateFilterTarget) => void
}

function route(ctx: ViewFilterContext, to: Routes): void {
  const target = filterTarget(ctx.getState())
  if (target === "feed") to.feed()
  else if (target === "state") to.overview()
  else to.state(target)
}

export function startFilter(ctx: ViewFilterContext): void {
  route(ctx, {
    feed: () => ctx.feed.startFilter(),
    overview: () => ctx.prInfoFilter.start(),
    state: (target) => ctx.setState((s) => startViewFilter(s, target)),
  })
}

export function setFilter(ctx: ViewFilterContext, value: string): void {
  route(ctx, {
    feed: () => ctx.feed.setFilter(value),
    overview: () => ctx.prInfoFilter.set(value),
    state: (target) => ctx.setState((s) => setViewFilter(s, target, value)),
  })
}

/** Enter: keep what the filter left and hand navigation back. */
export function commitFilter(ctx: ViewFilterContext): void {
  route(ctx, {
    feed: () => ctx.feed.commitFilter(),
    overview: () => ctx.prInfoFilter.commit(),
    state: (target) => ctx.setState((s) => commitViewFilter(s, target)),
  })
}

/** Escape: drop the filter entirely. */
export function clearFilter(ctx: ViewFilterContext): void {
  route(ctx, {
    feed: () => ctx.feed.clearFilter(),
    overview: () => ctx.prInfoFilter.clear(),
    state: (target) => ctx.setState((s) => clearViewFilter(s, target)),
  })
}

/**
 * filterTarget for the thread panel's keys, which run only over the diff or
 * the overview and so never stand in the feed. The overview's own filter is
 * not one of these: its keys go to its factory.
 */
export function stateFilterTarget(state: AppState): StateFilterTarget {
  const target = filterTarget(state)
  if (target === "feed") throw new Error("the feed's filter is in its factory: route it through view-filter.ts")
  if (target === "state") throw new Error("the PR overview's filter is in its factory: route it through view-filter.ts")
  return target
}

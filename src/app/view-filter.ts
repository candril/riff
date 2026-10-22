/**
 * `Ctrl-f`, `/` and the filter prompt for whatever has focus (spec 065). The
 * feed keeps its filter in its own factory and every other surface in
 * AppState, so the callers that can stand in the feed come through here.
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

export interface ViewFilterContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  feed: Pick<ActivityFeedState, "startFilter" | "setFilter" | "commitFilter" | "clearFilter">
}

function route(ctx: ViewFilterContext, onFeed: () => void, onState: (target: StateFilterTarget) => void): void {
  const target = filterTarget(ctx.getState())
  if (target === "feed") onFeed()
  else onState(target)
}

export function startFilter(ctx: ViewFilterContext): void {
  route(ctx, () => ctx.feed.startFilter(), (target) => ctx.setState((s) => startViewFilter(s, target)))
}

export function setFilter(ctx: ViewFilterContext, value: string): void {
  route(ctx, () => ctx.feed.setFilter(value), (target) => ctx.setState((s) => setViewFilter(s, target, value)))
}

/** Enter: keep what the filter left and hand navigation back. */
export function commitFilter(ctx: ViewFilterContext): void {
  route(ctx, () => ctx.feed.commitFilter(), (target) => ctx.setState((s) => commitViewFilter(s, target)))
}

/** Escape: drop the filter entirely. */
export function clearFilter(ctx: ViewFilterContext): void {
  route(ctx, () => ctx.feed.clearFilter(), (target) => ctx.setState((s) => clearViewFilter(s, target)))
}

/**
 * filterTarget for the PR overview's keys and the thread panel's, which run
 * only in the overview or over the diff and so never stand in the feed.
 */
export function stateFilterTarget(state: AppState): StateFilterTarget {
  const target = filterTarget(state)
  if (target === "feed") throw new Error("the feed's filter is in its factory: route it through view-filter.ts")
  return target
}

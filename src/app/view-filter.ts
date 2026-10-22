/**
 * `Ctrl-f`, `/` and the filter prompt for whatever has focus (spec 065). The
 * feed's filter is set apart from the other surfaces', so the callers that
 * can stand in the feed come through here.
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

export interface ViewFilterContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
}

function route(ctx: ViewFilterContext, onFeed: () => void, onState: (target: StateFilterTarget) => void): void {
  const target = filterTarget(ctx.getState())
  if (target === "feed") onFeed()
  else onState(target)
}

function updateFeed(ctx: ViewFilterContext, patch: Partial<AppState["feed"]>): void {
  ctx.setState((s) => ({ ...s, feed: { ...s.feed, ...patch } }))
}

export function startFilter(ctx: ViewFilterContext): void {
  route(ctx, () => updateFeed(ctx, { filterInput: true }), (target) => ctx.setState((s) => startViewFilter(s, target)))
}

export function setFilter(ctx: ViewFilterContext, value: string): void {
  route(ctx, () => updateFeed(ctx, { filter: value, highlightIndex: 0 }), (target) => ctx.setState((s) => setViewFilter(s, target, value)))
}

/** Enter: keep what the filter left and hand navigation back. */
export function commitFilter(ctx: ViewFilterContext): void {
  route(ctx, () => updateFeed(ctx, { filterInput: false }), (target) => ctx.setState((s) => commitViewFilter(s, target)))
}

/** Escape: drop the filter entirely. */
export function clearFilter(ctx: ViewFilterContext): void {
  route(ctx, () => updateFeed(ctx, { filter: "", filterInput: false }), (target) => ctx.setState((s) => clearViewFilter(s, target)))
}

/**
 * filterTarget for the PR overview's keys and the thread panel's, which run
 * only in the overview or over the diff and so never stand in the feed.
 */
export function stateFilterTarget(state: AppState): StateFilterTarget {
  const target = filterTarget(state)
  if (target === "feed") throw new Error("the feed's filter is set apart: route it through view-filter.ts")
  return target
}

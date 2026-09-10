/**
 * Feed input handling (specs 064, 065).
 *
 * The feed's own keys arrive with spec 070; what is here is the filter
 * prompt, which works the same way every prompt in riff does — riff takes
 * Enter and Escape, the input widget takes everything else.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import { clearViewFilter, commitViewFilter } from "../../state"

export interface FeedInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
}

export function handleInput(key: KeyEvent, ctx: FeedInputContext): boolean {
  if (ctx.state.viewMode !== "feed") return false

  if (ctx.state.feed.filterInput) {
    if (key.name === "escape") {
      key.preventDefault()
      ctx.setState(clearViewFilter)
      ctx.render()
    } else if (key.name === "return" || key.name === "enter") {
      key.preventDefault()
      ctx.setState(commitViewFilter)
      ctx.render()
    }
    return true
  }

  return false
}

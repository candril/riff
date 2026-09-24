/**
 * Occurrence picker input handling (spec 088).
 *
 * Captures every key while open. The query belongs to the shared prompt
 * field, which sees every key this handler does not `preventDefault`.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import { closeOccurrencePicker, moveOccurrencePickerSelection } from "../../state"
import { getOccurrenceResults, type OccurrenceHit } from "./filter"

export interface OccurrencePickerInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  onSelectHit: (hit: OccurrenceHit) => void
}

export function handleInput(key: KeyEvent, ctx: OccurrencePickerInputContext): boolean {
  if (!ctx.state.occurrencePicker.open) return false

  const { hits } = getOccurrenceResults(ctx.state)
  const maxIndex = Math.max(0, hits.length - 1)

  const move = (delta: number): void => {
    key.preventDefault()
    ctx.setState((s) => moveOccurrencePickerSelection(s, delta, maxIndex))
    ctx.render()
  }

  switch (key.name) {
    case "escape":
      key.preventDefault()
      ctx.setState(closeOccurrencePicker)
      ctx.render()
      return true

    case "return":
    case "enter": {
      key.preventDefault()
      const hit = hits[ctx.state.occurrencePicker.selectedIndex]
      if (hit) {
        ctx.setState(closeOccurrencePicker)
        ctx.onSelectHit(hit)
      }
      return true
    }

    case "up":
      move(-1)
      return true

    case "down":
      move(1)
      return true

    case "p":
      // Ctrl-p moves up; a bare `p` is a letter of the query.
      if (key.ctrl) move(-1)
      return true

    case "n":
      if (key.ctrl) move(1)
      return true

    default:
      return true
  }
}

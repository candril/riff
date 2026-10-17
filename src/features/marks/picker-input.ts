import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import { closeMarksPicker, marksPickerEntries, moveMarksPickerSelection } from "./picker-state"
import { deleteMark } from "./store"
import type { Mark } from "./types"

export interface MarksPickerInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /** The jump itself, wired by global-keys, so this module stays clear of the line mapping and the cursor. */
  onJump: (letter: string) => void
  save: (marks: readonly Mark[]) => void
}

type Key = Pick<KeyEvent, "name" | "ctrl" | "preventDefault">

/** Captures every key while the picker is open; false when it is closed. */
export function handleMarksPickerInput(key: Key, ctx: MarksPickerInputContext): boolean {
  if (!ctx.state.marksPicker.open) return false

  const entries = marksPickerEntries(ctx.state)
  const maxIndex = Math.max(0, entries.length - 1)
  const move = (delta: number): true => {
    key.preventDefault()
    ctx.setState((s) => moveMarksPickerSelection(s, delta, maxIndex))
    ctx.render()
    return true
  }

  switch (key.name) {
    case "escape":
      key.preventDefault()
      ctx.setState(closeMarksPicker)
      ctx.render()
      return true

    case "return":
    case "enter": {
      key.preventDefault()
      const entry = entries[ctx.state.marksPicker.selectedIndex]
      ctx.setState(closeMarksPicker)
      if (entry) ctx.onJump(entry.mark.letter)
      else ctx.render()
      return true
    }

    case "up":
      return move(-1)
    case "down":
      return move(1)
  }

  if (key.ctrl && key.name === "p") return move(-1)
  if (key.ctrl && key.name === "n") return move(1)
  if (key.ctrl && key.name === "x") {
    key.preventDefault()
    const entry = entries[ctx.state.marksPicker.selectedIndex]
    if (entry) deleteEntry(entry.mark.letter, entries.length - 2, ctx)
    return true
  }

  // Everything else is typing, and belongs to the prompt field; a bare x is a letter.
  return true
}

/** The filter keeps or drops each mark on its own, so the rows left are the same rows less this one. */
function deleteEntry(letter: string, lastIndex: number, ctx: MarksPickerInputContext): void {
  const marks = deleteMark(ctx.state.marks, letter)
  ctx.setState((s) => ({
    ...s,
    marks: deleteMark(s.marks, letter),
    marksPicker: { ...s.marksPicker, selectedIndex: Math.max(0, Math.min(s.marksPicker.selectedIndex, lastIndex)) },
  }))
  ctx.save(marks.marks)
  ctx.render()
}

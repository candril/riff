/**
 * The comment composer's `@mention`, `:emoji` and code span pickers (spec
 * 039, 082, 114): the trigger being typed and the match picked in its list. They are
 * a sub-modal of the composer, not review state, so the feature owns them
 * rather than AppState (spec 100, M6; ADR-003). Besides the reader's Esc
 * and an accepted match, these paths clear both: cancelling, closing or
 * reopening the composer or the thread panel, a reload, and a switch to
 * another review. Every one of them leaves the textarea the trigger was
 * read from, so a picker kept past it would answer for text no longer
 * there.
 */

import { createSignal } from "solid-js"

/**
 * An `@mention` being typed. `atOffset` is where its `@` sits in the
 * buffer, so accepting a candidate can replace `@<query>` with
 * `@<username> `.
 */
export interface MentionPickerState {
  query: string
  selectedIndex: number
  atOffset: number
}

/** An open `:shortcode` in the composer, and where its colon is (spec 082). */
export interface EmojiPickerState {
  query: string
  selectedIndex: number
  colonOffset: number
}

/** A name being typed in an open code span, and where its backtick is (spec 114). */
export interface SymbolPickerState {
  query: string
  selectedIndex: number
  backtickOffset: number
}

export type ComposerPickersState = ReturnType<typeof createComposerPickersState>

export function createComposerPickersState() {
  const [mention, setMentionSignal] = createSignal<MentionPickerState | null>(null)
  const [emoji, setEmojiSignal] = createSignal<EmojiPickerState | null>(null)
  const [symbol, setSymbolSignal] = createSignal<SymbolPickerState | null>(null)

  return {
    mention,
    emoji,
    symbol,
    /**
     * The selection survives a keystroke that leaves the trigger alone, or
     * the highlighted entry would snap back to the top as you type.
     */
    setMention(trigger: { query: string; atOffset: number } | null) {
      if (trigger === null) {
        if (mention() !== null) setMentionSignal(null)
        return
      }
      const prev = mention()
      if (prev && prev.query === trigger.query && prev.atOffset === trigger.atOffset) return
      setMentionSignal({ query: trigger.query, atOffset: trigger.atOffset, selectedIndex: 0 })
    },
    setEmoji(trigger: { query: string; colonOffset: number } | null) {
      if (trigger === null) {
        if (emoji() !== null) setEmojiSignal(null)
        return
      }
      const prev = emoji()
      if (prev && prev.query === trigger.query && prev.colonOffset === trigger.colonOffset) return
      setEmojiSignal({ query: trigger.query, colonOffset: trigger.colonOffset, selectedIndex: 0 })
    },
    setSymbol(trigger: { query: string; backtickOffset: number } | null) {
      if (trigger === null) {
        if (symbol() !== null) setSymbolSignal(null)
        return
      }
      const prev = symbol()
      if (prev && prev.query === trigger.query && prev.backtickOffset === trigger.backtickOffset) return
      setSymbolSignal({ query: trigger.query, backtickOffset: trigger.backtickOffset, selectedIndex: 0 })
    },
    /** The caller passes the candidate count, so the list is not derived twice. */
    moveMention(delta: number, count: number) {
      const picker = mention()
      if (!picker || count === 0) return
      const next = wrapped(picker.selectedIndex + delta, count)
      if (next !== picker.selectedIndex) setMentionSignal({ ...picker, selectedIndex: next })
    },
    moveEmoji(delta: number, count: number) {
      const picker = emoji()
      if (!picker || count === 0) return
      const next = wrapped(picker.selectedIndex + delta, count)
      if (next !== picker.selectedIndex) setEmojiSignal({ ...picker, selectedIndex: next })
    },
    moveSymbol(delta: number, count: number) {
      const picker = symbol()
      if (!picker || count === 0) return
      const next = wrapped(picker.selectedIndex + delta, count)
      if (next !== picker.selectedIndex) setSymbolSignal({ ...picker, selectedIndex: next })
    },
    clear() {
      if (mention() !== null) setMentionSignal(null)
      if (emoji() !== null) setEmojiSignal(null)
      if (symbol() !== null) setSymbolSignal(null)
    },
  }
}

function wrapped(index: number, count: number): number {
  if (index < 0) return count - 1
  if (index >= count) return 0
  return index
}

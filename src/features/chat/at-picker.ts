/**
 * The chat input's `@` picker (spec 102), the comment composer's mention
 * picker offering what a question can attach. The chat owns its state
 * rather than AppState (ADR-003).
 */

import { createSignal } from "solid-js"
import { clampSelection, filterAtCandidates, type AtPicker } from "../../components/at-picker"
import { theme } from "../../theme"
import { detectAtTrigger } from "../../utils/mentions"
import type { InputPicker } from "../../app/at-picker-keys"
import { replaceTextRange, type RangeTextarea } from "../../app/textarea-range"
import type { AtCandidate } from "./at-candidates"

export type ChatAtPicker = ReturnType<typeof createChatAtPicker>

interface Session {
  query: string
  atOffset: number
  selectedIndex: number
}

// Paths carry dots and slashes, so the query runs to the next whitespace.
const QUERY_CHARS = /\S/

/** `input` is the chat's textarea, which an accepted token is spliced into. */
export function createChatAtPicker(
  candidates: () => readonly AtCandidate[] = () => [],
  input: () => RangeTextarea | null = () => null,
) {
  const [session, setSession] = createSignal<Session | null>(null)
  const matches = () => {
    const open = session()
    return open ? filterAtCandidates(candidates(), open.query, (candidate) => candidate.keys) : []
  }
  const close = () => setSession(null)

  const control: InputPicker = {
    open: () => session() !== null,
    matches: () => matches().length,
    close,
    move(delta) {
      const open = session()
      const count = matches().length
      if (!open || count === 0) return
      const current = clampSelection(open.selectedIndex, count)
      setSession({ ...open, selectedIndex: (current + delta + count) % count })
    },
    accept() {
      const open = session()
      const found = matches()
      const textarea = input()
      if (!open || found.length === 0 || !textarea) return
      const chosen = found[clampSelection(open.selectedIndex, found.length)]!
      // The trailing space ends the trigger, so the edit's own follow
      // leaves the picker shut.
      replaceTextRange(textarea, open.atOffset, textarea.cursorOffset, `${chosen.text} `)
      close()
    },
  }

  return {
    ...control,
    session,
    candidates: matches,
    view(): AtPicker | null {
      const open = session()
      if (!open) return null
      const found = matches()
      if (found.length === 0) return { kind: "empty", text: `No match for @${open.query}` }
      return {
        kind: "rows",
        title: "@attach",
        accent: theme.blue,
        rows: found.map(({ text, fg, detail }) => ({ text, fg, detail })),
        selected: clampSelection(open.selectedIndex, found.length),
      }
    },
    /**
     * Called on every edit and cursor move. The selection survives one that
     * leaves the trigger alone, or the chosen row would snap back to the top.
     */
    follow(text: string, cursorOffset: number) {
      const trigger = detectAtTrigger(text, cursorOffset, QUERY_CHARS)
      const open = session()
      if (!trigger) return close()
      if (open && open.query === trigger.query && open.atOffset === trigger.atOffset) return
      setSession({ ...trigger, selectedIndex: 0 })
    },
  }
}

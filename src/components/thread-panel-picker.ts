import type { EmojiPickerState, MentionPickerState, SymbolPickerState } from "../features/inline-comment-overlay/composer-pickers-state"
import { theme } from "../theme"
import { filterEmoji } from "../utils/emoji"
import type { FuzzyHit } from "../utils/fuzzy"
import { atRowSpans, clampSelection, filterAtCandidates, filterAtMatches, type AtPicker } from "./at-picker"
import { displayAuthor } from "./display-author"
import { pickerWindow } from "./picker-window"

export function getFilteredMentionCandidates(candidates: readonly string[], query: string): string[] {
  return filterAtCandidates(candidates, query, (c) => c)
}

let lastSymbolMatches: { candidates: readonly string[]; query: string; hits: FuzzyHit<string>[] } | null = null

/** One filter per keystroke: the keymap asks whether the picker is open several times for each key, over thousands of names. */
export function symbolMatches(candidates: readonly string[], query: string): FuzzyHit<string>[] {
  if (lastSymbolMatches?.candidates === candidates && lastSymbolMatches.query === query) return lastSymbolMatches.hits
  const hits = filterAtMatches(candidates, query, (c) => c)
  lastSymbolMatches = { candidates, query, hits }
  return hits
}

/**
 * Mention rows are names as drawn. Accepting one inserts the raw login,
 * which the composer reads from `getFilteredMentionCandidates` itself.
 *
 * The emoji a `:shortcode` found wears the mention picker's clothes — one
 * composer, one kind of picker (spec 082). An open emoji session wins over
 * a mention one.
 */
export type ThreadPanelPicker =
  | { kind: "emoji"; rows: EmojiRow[]; selected: number }
  | { kind: "emoji-empty"; text: string }
  | { kind: "mention"; picker: AtPicker }
  | { kind: "symbol"; picker: AtPicker }
  | null

/**
 * An emoji as the picker draws it: a copy, never the shared table's entry.
 * The panel's store reconciles rows in place, so a row that was the
 * table's entry would turn the table into whatever the last query showed
 * there. The shortcode keys it, so a narrowed query keeps the rows it still
 * shows instead of rewriting them by position.
 */
export interface EmojiRow {
  key: string
  name: string
  char: string
}

export function threadPanelPicker(input: {
  emojiPicker: EmojiPickerState | null
  mentionPicker: MentionPickerState | null
  mentionCandidates: readonly string[]
  mentionSearchQuery: string | null
  symbolPicker: SymbolPickerState | null
  symbolCandidates: readonly string[]
}): ThreadPanelPicker {
  const { emojiPicker, mentionPicker, symbolPicker } = input
  if (emojiPicker) {
    const matches = filterEmoji(emojiPicker.query)
    if (matches.length === 0) return { kind: "emoji-empty", text: `No emoji for :${emojiPicker.query}` }
    const rows = matches.map(({ name, char }) => ({ key: name, name, char }))
    return { kind: "emoji", rows, selected: clampSelection(emojiPicker.selectedIndex, matches.length) }
  }
  if (mentionPicker) return { kind: "mention", picker: mentionAtPicker(input, mentionPicker) }
  if (symbolPicker) return symbolAtPicker(input.symbolCandidates, symbolPicker)
  return null
}

/** Null with no match: a name the diff does not have yet is what a rename comment types (spec 114). */
function symbolAtPicker(candidates: readonly string[], symbolPicker: SymbolPickerState): ThreadPanelPicker {
  const hits = symbolMatches(candidates, symbolPicker.query)
  if (hits.length === 0) return null
  return {
    kind: "symbol",
    picker: {
      kind: "rows",
      title: "`symbol",
      accent: theme.teal,
      rows: hits.map(({ item: name, positions }) => ({ text: name, spans: atRowSpans(name, name, positions) })),
      selected: clampSelection(symbolPicker.selectedIndex, hits.length),
    },
  }
}

function mentionAtPicker(
  input: { mentionCandidates: readonly string[]; mentionSearchQuery: string | null },
  mentionPicker: MentionPickerState
): AtPicker {
  const filtered = filterAtMatches(input.mentionCandidates, mentionPicker.query, (c) => c)
  if (filtered.length === 0) {
    return { kind: "empty", text: emptyPickerMessage(mentionPicker.query, input.mentionSearchQuery) }
  }
  return {
    kind: "rows",
    title: "@mention",
    accent: theme.blue,
    rows: filtered.map(({ item: login, positions }) => {
      const text = displayAuthor(login)
      return { text, spans: atRowSpans(text, login, positions) }
    }),
    selected: clampSelection(mentionPicker.selectedIndex, filtered.length),
  }
}

/**
 * Distinguish "nobody matches" from "still asking GitHub" — the lookup takes
 * about half a second, and without the hint that reads as a dead picker.
 */
export function emptyPickerMessage(query: string, searchQuery: string | null): string {
  if (!query) return "No participants to mention"
  if (searchQuery === query) return `Searching GitHub for @${query}…`
  return `No match for @${query}`
}

/** The rows a picker spends besides its list: the title and the footer, and the mention list's gap above. */
const EMOJI_CHROME_ROWS = 2
const MENTION_CHROME_ROWS = 3

/**
 * The picker cut to the `room` rows above the composer, its selection kept in
 * view: it floats over whatever is above, and on a short panel its top rows
 * would cover the header and take the selection, what Tab inserts, with them.
 * Null room, with no rows above the composer to fit, leaves it whole.
 */
export function fitPicker(picker: ThreadPanelPicker, room: number | null): ThreadPanelPicker {
  if (room === null || picker === null) return picker
  if (picker.kind === "emoji") {
    const { rows, selected } = windowed(picker.rows, picker.selected, room - EMOJI_CHROME_ROWS)
    return { ...picker, rows, selected }
  }
  if ((picker.kind === "mention" || picker.kind === "symbol") && picker.picker.kind === "rows") {
    const { rows, selected } = windowed(picker.picker.rows, picker.picker.selected, room - MENTION_CHROME_ROWS)
    return { ...picker, picker: { ...picker.picker, rows, selected } }
  }
  return picker
}

function windowed<Row>(rows: Row[], selected: number, max: number): { rows: Row[]; selected: number } {
  const { start, end } = pickerWindow(rows.length, selected, Math.max(1, max))
  return { rows: rows.slice(start, end), selected: selected - start }
}

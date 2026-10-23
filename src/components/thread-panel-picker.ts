import type { EmojiPickerState, MentionPickerState } from "../features/inline-comment-overlay/composer-pickers-state"
import { theme } from "../theme"
import { filterEmoji, type Emoji } from "../utils/emoji"
import { clampSelection, filterAtCandidates, type AtPicker } from "./at-picker"
import { displayAuthor } from "./display-author"

export function getFilteredMentionCandidates(candidates: readonly string[], query: string): string[] {
  return filterAtCandidates(candidates, query, (c) => c)
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
  | { kind: "emoji"; rows: Emoji[]; selected: number }
  | { kind: "emoji-empty"; text: string }
  | { kind: "mention"; picker: AtPicker }
  | null

export function threadPanelPicker(input: {
  emojiPicker: EmojiPickerState | null
  mentionPicker: MentionPickerState | null
  mentionCandidates: readonly string[]
  mentionSearchQuery: string | null
}): ThreadPanelPicker {
  const { emojiPicker, mentionPicker } = input
  if (emojiPicker) {
    const matches = filterEmoji(emojiPicker.query)
    if (matches.length === 0) return { kind: "emoji-empty", text: `No emoji for :${emojiPicker.query}` }
    return { kind: "emoji", rows: matches, selected: clampSelection(emojiPicker.selectedIndex, matches.length) }
  }
  if (mentionPicker) return { kind: "mention", picker: mentionAtPicker(input, mentionPicker) }
  return null
}

function mentionAtPicker(
  input: { mentionCandidates: readonly string[]; mentionSearchQuery: string | null },
  mentionPicker: MentionPickerState
): AtPicker {
  const filtered = getFilteredMentionCandidates(input.mentionCandidates, mentionPicker.query)
  if (filtered.length === 0) {
    return { kind: "empty", text: emptyPickerMessage(mentionPicker.query, input.mentionSearchQuery) }
  }
  return {
    kind: "rows",
    title: "@mention",
    accent: theme.blue,
    rows: filtered.map((login) => ({ text: displayAuthor(login) })),
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

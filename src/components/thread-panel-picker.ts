import type { EmojiPickerState, MentionPickerState } from "../state"
import { fuzzyFilter } from "../utils/fuzzy"
import { filterEmoji, type Emoji } from "../utils/emoji"

export const MENTION_VISIBLE_LIMIT = 6

export function getFilteredMentionCandidates(
  candidates: readonly string[],
  query: string
): string[] {
  return fuzzyFilter(query, [...candidates], (c) => c).slice(0, MENTION_VISIBLE_LIMIT)
}

/**
 * The emoji a `:shortcode` found wears the mention picker's clothes — one
 * composer, one kind of picker (spec 082). An open emoji session wins over
 * a mention one.
 */
export type ThreadPanelPicker =
  | { kind: "emoji"; rows: Emoji[]; selected: number }
  | { kind: "emoji-empty"; text: string }
  | { kind: "mention"; rows: string[]; selected: number }
  | { kind: "mention-empty"; text: string }
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
  if (mentionPicker) {
    const filtered = getFilteredMentionCandidates(input.mentionCandidates, mentionPicker.query)
    if (filtered.length === 0) {
      return { kind: "mention-empty", text: emptyPickerMessage(mentionPicker.query, input.mentionSearchQuery) }
    }
    return { kind: "mention", rows: filtered, selected: clampSelection(mentionPicker.selectedIndex, filtered.length) }
  }
  return null
}

/**
 * The list can shrink under a selection made a keystroke earlier (a
 * character deleted broadens the match set, the next one narrows it).
 */
export function clampSelection(selectedIndex: number, count: number): number {
  return Math.min(selectedIndex, count - 1)
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

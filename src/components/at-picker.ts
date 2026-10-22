/**
 * The `@` picker an input opens on a typed `@`: the comment composer's
 * mentions (spec 082) and the chat's references (spec 102). Each input
 * brings its own candidates; the list, its keys and its look are one.
 */

import { fuzzyFilter } from "../utils/fuzzy"

export const MENTION_VISIBLE_LIMIT = 6

export interface AtPickerRow {
  text: string
  fg?: string
  /** Drawn right of the text, dimmed: a file's status and line counts. */
  detail?: string
}

export type AtPicker =
  | { kind: "rows"; title: string; accent: string; rows: AtPickerRow[]; selected: number }
  | { kind: "empty"; text: string }

/** `keys` returns the texts a query is matched against, the strongest first. */
export function filterAtCandidates<T>(
  candidates: readonly T[],
  query: string,
  keys: (candidate: T) => string | string[]
): T[] {
  return fuzzyFilter(query, [...candidates], keys).slice(0, MENTION_VISIBLE_LIMIT)
}

/**
 * The list can shrink under a selection made a keystroke earlier (a
 * character deleted broadens the match set, the next one narrows it).
 */
export function clampSelection(selectedIndex: number, count: number): number {
  return Math.min(selectedIndex, count - 1)
}

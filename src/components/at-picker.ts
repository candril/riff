/**
 * The `@` picker an input opens on a typed `@`: the comment composer's
 * mentions (spec 082) and the chat's references (spec 102). Each input
 * brings its own candidates; the list, its keys and its look are one.
 */

import { fuzzyFilterMatches, type FuzzyHit } from "../utils/fuzzy"
import { matchSpans, type MatchSpan } from "./match-spans"

export const MENTION_VISIBLE_LIMIT = 6

export interface AtPickerRow {
  text: string
  fg?: string
  /** Drawn right of the text, dimmed: a file's status and line counts. */
  detail?: string
  /** The text with what the query matched picked out; the plain text without one. */
  spans?: MatchSpan[]
}

export type AtPicker =
  | { kind: "rows"; title: string; accent: string; rows: AtPickerRow[]; selected: number }
  | { kind: "empty"; text: string }

/** `keys` returns the texts a query is matched against, the strongest first. */
export function filterAtMatches<T>(
  candidates: readonly T[],
  query: string,
  keys: (candidate: T) => string | string[]
): FuzzyHit<T>[] {
  return fuzzyFilterMatches(query, candidates, keys).slice(0, MENTION_VISIBLE_LIMIT)
}

export function filterAtCandidates<T>(
  candidates: readonly T[],
  query: string,
  keys: (candidate: T) => string | string[]
): T[] {
  return filterAtMatches(candidates, query, keys).map(({ item }) => item)
}

/**
 * A row's text with the matched key picked out. Every key a row is matched
 * on ends its text (`@` + login, `@` + path, a path's basename), so the
 * match lands at the end; a key the text does not end with shows none.
 */
export function atRowSpans(text: string, key: string, positions: readonly number[]): MatchSpan[] {
  return text.endsWith(key) ? matchSpans(text, positions, key.length - text.length) : matchSpans(text)
}

export const keyOf = (keys: string | string[], field: number): string =>
  Array.isArray(keys) ? (keys[field] ?? "") : keys

/**
 * The list can shrink under a selection made a keystroke earlier (a
 * character deleted broadens the match set, the next one narrows it).
 */
export function clampSelection(selectedIndex: number, count: number): number {
  return Math.min(selectedIndex, count - 1)
}

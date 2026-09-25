/**
 * Query → grouped hits for the occurrence picker (spec 088).
 */

import type { AppState } from "../../state"
import type { DiffFile } from "../../utils/diff-parser"
import { compileSearchPattern } from "../../vim-diff/search-engine"
import { buildOccurrenceRows, type OccurrenceRow } from "./corpus"

/** More than this is a query that has not narrowed yet, not a list to read. */
export const MAX_HITS = 1000

/** A `[start, end)` column range. */
export type Span = readonly [number, number]

export interface OccurrenceHit {
  row: OccurrenceRow
  /** The first match on the row; the cursor lands on it. */
  startCol: number
  endCol: number
  /** Where the narrowing terms are in the row's text (spec 099). */
  narrowSpans: Span[]
}

export interface OccurrenceGroup {
  filename: string
  /** Where the narrowing terms are in the filename. */
  pathSpans: Span[]
  /** Every matching row in the file, including any past the cap. */
  count: number
  hits: OccurrenceHit[]
}

export interface OccurrenceResults {
  groups: OccurrenceGroup[]
  /** The listed hits in display order — what the selection indexes. */
  hits: OccurrenceHit[]
  total: number
  fileCount: number
  capped: boolean
}

const EMPTY: OccurrenceResults = { groups: [], hits: [], total: 0, fileCount: 0, capped: false }

export function findOccurrences(
  rows: readonly OccurrenceRow[],
  query: string,
  filter = "",
  cap: number = MAX_HITS
): OccurrenceResults {
  const regex = compileSearchPattern(query)
  if (!regex) return EMPTY
  const narrowing = compileNarrowing(filter)

  const groups: OccurrenceGroup[] = []
  const hits: OccurrenceHit[] = []
  let total = 0

  for (const row of rows) {
    regex.lastIndex = 0
    const match = regex.exec(row.text)
    if (!match || !narrowing.keep(row)) continue

    total++
    let group = groups[groups.length - 1]
    if (group?.filename !== row.filename) {
      group = { filename: row.filename, pathSpans: narrowing.spansIn(row.filename), count: 0, hits: [] }
      groups.push(group)
    }
    group.count++

    if (hits.length < cap) {
      const hit = {
        row,
        startCol: match.index,
        endCol: match.index + match[0].length,
        narrowSpans: narrowing.spansIn(row.text),
      }
      group.hits.push(hit)
      hits.push(hit)
    }
  }

  return {
    groups: groups.filter((group) => group.hits.length > 0),
    hits,
    total,
    fileCount: groups.length,
    capped: total > hits.length,
  }
}

/**
 * Every term must be in the row's path or text; a `!term` in neither.
 * Terms are literal and smart-case, as the query is.
 */
export function compileNarrowing(filter: string): {
  keep: (row: OccurrenceRow) => boolean
  /** Every place a term that is not a `!term` occurs in the text. */
  spansIn: (text: string) => Span[]
} {
  const terms = filter
    .split(/\s+/)
    .map((word) => (word.startsWith("!") ? { negate: true, text: word.slice(1) } : { negate: false, text: word }))
    .flatMap(({ negate, text }) => {
      const regex = compileSearchPattern(text)
      return regex ? [{ negate, regex }] : []
    })

  return {
    keep: (row) =>
      terms.every(({ negate, regex }) => {
        regex.lastIndex = 0
        const inPath = regex.test(row.filename)
        regex.lastIndex = 0
        return (inPath || regex.test(row.text)) !== negate
      }),
    spansIn: (text) =>
      terms
        .filter((term) => !term.negate)
        .flatMap(({ regex }) => {
          // `matchAll` starts from the `lastIndex` that `keep` left behind.
          regex.lastIndex = 0
          return [...text.matchAll(regex)].map((m): Span => [m.index, m.index + m[0].length])
        }),
  }
}

// The picker asks on every keystroke and every render; the rows only change
// when the change set does, and the results only when the query does too.
const rowsByFiles = new WeakMap<readonly DiffFile[], OccurrenceRow[]>()
let lastResults: {
  files: readonly DiffFile[]
  query: string
  filter: string
  results: OccurrenceResults
} | null = null

export function getOccurrenceResults(state: AppState): OccurrenceResults {
  const { files } = state
  const { query, filter } = state.occurrencePicker
  if (lastResults?.files === files && lastResults.query === query && lastResults.filter === filter) {
    return lastResults.results
  }

  let rows = rowsByFiles.get(files)
  if (!rows) {
    rows = buildOccurrenceRows(files)
    rowsByFiles.set(files, rows)
  }
  const results = findOccurrences(rows, query, filter)
  lastResults = { files, query, filter, results }
  return results
}

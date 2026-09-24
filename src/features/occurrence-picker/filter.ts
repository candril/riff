/**
 * Query → grouped hits for the occurrence picker (spec 088).
 */

import type { AppState } from "../../state"
import type { DiffFile } from "../../utils/diff-parser"
import { compileSearchPattern } from "../../vim-diff/search-engine"
import { buildOccurrenceRows, type OccurrenceRow } from "./corpus"

/** More than this is a query that has not narrowed yet, not a list to read. */
export const MAX_HITS = 1000

export interface OccurrenceHit {
  row: OccurrenceRow
  /** The first match on the row; the cursor lands on it. */
  startCol: number
  endCol: number
}

export interface OccurrenceGroup {
  filename: string
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
  cap: number = MAX_HITS
): OccurrenceResults {
  const regex = compileSearchPattern(query)
  if (!regex) return EMPTY

  const groups: OccurrenceGroup[] = []
  const hits: OccurrenceHit[] = []
  let total = 0

  for (const row of rows) {
    regex.lastIndex = 0
    const match = regex.exec(row.text)
    if (!match) continue

    total++
    let group = groups[groups.length - 1]
    if (group?.filename !== row.filename) {
      group = { filename: row.filename, count: 0, hits: [] }
      groups.push(group)
    }
    group.count++

    if (hits.length < cap) {
      const hit = { row, startCol: match.index, endCol: match.index + match[0].length }
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

// The picker asks on every keystroke and every render; the rows only change
// when the change set does, and the results only when the query does too.
const rowsByFiles = new WeakMap<readonly DiffFile[], OccurrenceRow[]>()
let lastResults: { files: readonly DiffFile[]; query: string; results: OccurrenceResults } | null = null

export function getOccurrenceResults(state: AppState): OccurrenceResults {
  const { files } = state
  const query = state.occurrencePicker.query
  if (lastResults?.files === files && lastResults.query === query) return lastResults.results

  let rows = rowsByFiles.get(files)
  if (!rows) {
    rows = buildOccurrenceRows(files)
    rowsByFiles.set(files, rows)
  }
  const results = findOccurrences(rows, query)
  lastResults = { files, query, results }
  return results
}

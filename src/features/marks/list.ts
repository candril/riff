import type { DiffFile } from "../../utils/diff-parser"
import { fuzzyFilterMatches } from "../../utils/fuzzy"
import { marksInOrder } from "./store"
import { patchLines } from "./patch-lines"
import type { Mark, MarksState } from "./types"

export interface MarkEntry {
  mark: Mark
  text: string
  /** Where the query matched `markEntrySearchText`. */
  matched?: number[]
}

export function markEntries(marks: Pick<MarksState, "marks">, files: readonly DiffFile[]): MarkEntry[] {
  const byName = new Map(files.map((f) => [f.filename, f]))
  return marksInOrder(marks).map((mark) => ({ mark, text: markLineText(byName.get(mark.filename), mark) }))
}

/**
 * The marked line's text for display. A line outside every hunk was marked
 * on expanded context, which the patch does not carry, so it has none.
 */
export function markLineText(file: DiffFile | undefined, mark: Mark): string {
  if (!file || mark.line === null) return ""
  return patchLines(file, mark.side).get(mark.line)?.trimStart() ?? ""
}

export function markEntryLocation(entry: MarkEntry): string {
  const { filename, line } = entry.mark
  return line === null ? filename : `${filename}:${line}`
}

/** The one text a mark is matched on; `matched` indexes it. */
export function markEntrySearchText(entry: MarkEntry): string {
  return `${entry.mark.letter} ${markEntryLocation(entry)} ${entry.text}`
}

export function filterMarkEntries(entries: MarkEntry[], query: string): MarkEntry[] {
  if (!query) return entries
  return fuzzyFilterMatches(query, entries, markEntrySearchText).map(({ item, positions }) => ({
    ...item,
    matched: positions,
  }))
}

export function marksPickerEntries(marks: Pick<MarksState, "marks">, files: readonly DiffFile[], query: string): MarkEntry[] {
  return filterMarkEntries(markEntries(marks, files), query)
}

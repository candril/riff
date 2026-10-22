import type { DiffFile } from "../../utils/diff-parser"
import { fuzzyFilter } from "../../utils/fuzzy"
import { marksInOrder } from "./store"
import { patchLines } from "./patch-lines"
import type { Mark, MarksState } from "./types"

export interface MarkEntry {
  mark: Mark
  text: string
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

export function filterMarkEntries(entries: MarkEntry[], query: string): MarkEntry[] {
  return fuzzyFilter(query, entries, (e) => `${e.mark.letter} ${markEntryLocation(e)} ${e.text}`)
}

export function marksPickerEntries(marks: Pick<MarksState, "marks">, files: readonly DiffFile[], query: string): MarkEntry[] {
  return filterMarkEntries(markEntries(marks, files), query)
}

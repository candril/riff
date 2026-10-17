import type { DiffFile } from "../../utils/diff-parser"
import { fuzzyFilter } from "../../utils/fuzzy"
import { marksInOrder } from "./store"
import type { Mark, MarksState } from "./types"

export interface MarkEntry {
  mark: Mark
  text: string
}

export function markEntries(marks: MarksState, files: readonly DiffFile[]): MarkEntry[] {
  const byName = new Map(files.map((f) => [f.filename, f]))
  return marksInOrder(marks).map((mark) => ({ mark, text: markLineText(byName.get(mark.filename), mark) }))
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * The marked line's text, read from the file's own patch rather than the
 * parsed rows: those live in a small LRU, and the list would otherwise show
 * text only for the files parsed last. A line outside every hunk was marked
 * on expanded context, which the patch does not carry, so it has none.
 */
export function markLineText(file: DiffFile | undefined, mark: Mark): string {
  if (!file || mark.line === null) return ""

  let oldLine = 0
  let newLine = 0
  let inHunk = false
  for (const raw of file.content.split("\n")) {
    const header = HUNK_HEADER.exec(raw)
    if (header) {
      oldLine = Number(header[1])
      newLine = Number(header[2])
      inHunk = true
      continue
    }
    if (!inHunk || raw.startsWith("\\")) continue

    const prefix = raw[0]
    const onOld = prefix === " " || prefix === "-"
    const onNew = prefix === " " || prefix === "+"
    if (!onOld && !onNew) continue

    const hit = mark.side === "LEFT" ? onOld && oldLine === mark.line : onNew && newLine === mark.line
    if (hit) return raw.slice(1).trimStart()
    if (onOld) oldLine++
    if (onNew) newLine++
  }
  return ""
}

export function markEntryLocation(entry: MarkEntry): string {
  const { filename, line } = entry.mark
  return line === null ? filename : `${filename}:${line}`
}

export function filterMarkEntries(entries: MarkEntry[], query: string): MarkEntry[] {
  return fuzzyFilter(query, entries, (e) => `${e.mark.letter} ${markEntryLocation(e)} ${e.text}`)
}

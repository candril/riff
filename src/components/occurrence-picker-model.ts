import { theme, colors } from "../theme"
import type { OccurrenceGroup, OccurrenceHit, OccurrenceResults } from "../features/occurrence-picker/filter"
import { excerpt, highlight, narrowMarks, type Segment } from "./occurrence-excerpt"
import { pickerWindow, visibleRows, type PickerModel, type PickerRow } from "./picker-window"

export interface OccurrenceFileRow extends PickerRow {
  kind: "file"
  name: Segment[]
  count: string
}

export interface OccurrenceHitRow extends PickerRow {
  kind: "hit"
  lineNum: string
  marker: string
  markerFg: string
  textFg: string
  excerpt: Segment[]
}

export type OccurrencePickerRow = OccurrenceFileRow | OccurrenceHitRow

/** The count sits among the hints, between the ^g toggle and esc, so the frame draws none of its own. */
export interface OccurrencePickerModel extends Omit<PickerModel<OccurrencePickerRow>, "count"> {
  count: null
  /** The query being narrowed, drawn beside the title, or null while searching. */
  badge: string | null
}

type DisplayRow = { kind: "file"; group: OccurrenceGroup } | { kind: "hit"; hit: OccurrenceHit; index: number }

export function countText(query: string, results: OccurrenceResults): string {
  if (!query) return ""
  const files = `${results.fileCount} file${results.fileCount === 1 ? "" : "s"}`
  if (results.capped) return `first ${results.hits.length} of ${results.total} in ${files}`
  return `${results.total} in ${files}`
}

function fileRow(group: OccurrenceGroup): OccurrenceFileRow {
  return {
    id: `file:${group.filename}`,
    selected: false,
    kind: "file",
    name: highlight(group.filename, narrowMarks(group.pathSpans)),
    count: String(group.count),
  }
}

function hitRow(hit: OccurrenceHit, index: number, selected: boolean): OccurrenceHitRow {
  const { row } = hit
  return {
    id: `hit:${index}`,
    selected,
    kind: "hit",
    lineNum: String(row.lineNum).padStart(6),
    marker: row.kind === "addition" ? "+" : row.kind === "deletion" ? "-" : " ",
    markerFg: row.kind === "addition" ? colors.addedFg : row.kind === "deletion" ? colors.removedFg : theme.overlay0,
    textFg: selected ? theme.text : theme.subtext1,
    excerpt: excerpt(row.text, [hit.startCol, hit.endCol], hit.narrowSpans),
  }
}

/**
 * Ctrl-s (spec 088): every row of the diff the query hits, under a header
 * per file. The window is over rows, headers included, and keeps the
 * selected hit's row in view.
 */
export function occurrencePickerModel(
  query: string,
  narrowing: boolean,
  results: OccurrenceResults,
  selectedIndex: number,
  height: number
): OccurrencePickerModel {
  const rows: DisplayRow[] = []
  let selectedRow = 0
  let hitIndex = 0
  for (const group of results.groups) {
    rows.push({ kind: "file", group })
    for (const hit of group.hits) {
      if (hitIndex === selectedIndex) selectedRow = rows.length
      rows.push({ kind: "hit", hit, index: hitIndex++ })
    }
  }

  const { start, end, above, below } = pickerWindow(rows.length, selectedRow, visibleRows(height))
  const visible = rows.slice(start, end)
  // A file header scrolled off the top would leave its hits unattributed.
  const first = visible[0]
  if (first?.kind === "hit") {
    const group = results.groups.find((g) => g.hits.includes(first.hit))
    if (group) visible[0] = { kind: "file", group }
  }

  return {
    title: "Occurrences",
    badge: narrowing ? `${query} ›` : null,
    count: null,
    hints: [narrowing ? "^g search" : "^g narrow", countText(query, results), "esc"],
    rows: visible.map((row) => (row.kind === "file" ? fileRow(row.group) : hitRow(row.hit, row.index, row.index === selectedIndex))),
    above,
    below,
    empty: query && rows.length === 0 ? "No matches in the diff" : null,
  }
}

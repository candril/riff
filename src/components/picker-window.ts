/** Max visible rows in a picker's list. */
export const MAX_VISIBLE = 20

export interface PickerWindow {
  start: number
  end: number
  above: number
  below: number
  /** "i/n", or "0" when nothing matches. */
  count: string
}

/** The slice of a picker's entries in view, the selection kept roughly centred. */
export function pickerWindow(total: number, selectedIndex: number, max = MAX_VISIBLE): PickerWindow {
  const start = total > max ? Math.max(0, Math.min(selectedIndex - Math.floor(max / 2), total - max)) : 0
  const end = Math.min(start + max, total)
  return { start, end, above: start, below: total - end, count: total > 0 ? `${selectedIndex + 1}/${total}` : "0" }
}

/** What every picker row carries: an id for reconcile to match it by, and whether it is the selection. */
export interface PickerRow {
  id: string
  selected: boolean
}

export interface PickerModel<Row extends PickerRow> {
  title: string
  count: string
  hints: string[]
  /** Only the rows in view. */
  rows: Row[]
  above: number
  below: number
  /** What an empty list says, or null to say nothing. */
  empty: string | null
}

export function pickerModel<Entry, Row extends PickerRow>(
  entries: readonly Entry[],
  selectedIndex: number,
  header: { title: string; hints: string[]; empty: string | null },
  row: (entry: Entry, selected: boolean, index: number) => Row
): PickerModel<Row> {
  const { start, end, above, below, count } = pickerWindow(entries.length, selectedIndex)
  return {
    title: header.title,
    count,
    hints: header.hints,
    rows: entries.slice(start, end).map((entry, i) => row(entry, start + i === selectedIndex, start + i)),
    above,
    below,
    empty: entries.length === 0 ? header.empty : null,
  }
}

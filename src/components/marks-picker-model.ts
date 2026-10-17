import { theme } from "../theme"
import { markEntryLocation, type MarkEntry } from "../features/marks"
import { pickerModel, type PickerModel, type PickerRow } from "./picker-window"

export interface MarksPickerRow extends PickerRow {
  letter: string
  letterFg: string
  location: string
  locationFg: string
  text: string
  textFg: string
}

export type MarksPickerModel = PickerModel<MarksPickerRow>

/** `anyMarks`: whether any mark is set, filtered out or not; an empty list then says how to set one. */
export function marksPickerModel(entries: readonly MarkEntry[], selectedIndex: number, anyMarks: boolean): MarksPickerModel {
  return pickerModel(
    entries,
    selectedIndex,
    { title: "Marks", hints: ["^x delete", "esc"], empty: anyMarks ? "No matching marks" : "No marks — m{letter} sets one" },
    (entry, selected) => ({
      id: entry.mark.letter,
      selected,
      letter: entry.mark.letter,
      letterFg: theme.peach,
      location: markEntryLocation(entry),
      locationFg: selected ? theme.text : theme.subtext1,
      text: entry.text,
      textFg: selected ? theme.subtext0 : theme.overlay0,
    })
  )
}

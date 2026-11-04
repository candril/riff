import { theme } from "../theme"
import { markEntryLocation, type MarkEntry } from "../features/marks"
import { matchSpans, type MatchSpan } from "./match-spans"
import { pickerModel, type PickerModel, type PickerRow } from "./picker-window"

export interface MarksPickerRow extends PickerRow {
  letter: string
  letterSpans: MatchSpan[]
  letterFg: string
  location: string
  locationSpans: MatchSpan[]
  locationFg: string
  text: string
  textSpans: MatchSpan[]
  textFg: string
}

export type MarksPickerModel = PickerModel<MarksPickerRow>

/** `anyMarks`: whether any mark is set, filtered out or not; an empty list then says how to set one. */
export function marksPickerModel(
  entries: readonly MarkEntry[],
  selectedIndex: number,
  anyMarks: boolean,
  height: number
): MarksPickerModel {
  return pickerModel(
    entries,
    selectedIndex,
    height,
    { title: "Marks", hints: ["^x delete", "esc"], empty: anyMarks ? "No matching marks" : "No marks — m{letter} sets one" },
    (entry, selected) => {
      const { letter } = entry.mark
      const location = markEntryLocation(entry)
      // Where each part sits in the text the query matched: letter, location and text, a space apart.
      const locationAt = letter.length + 1
      const textAt = locationAt + location.length + 1
      return {
        id: letter,
        selected,
        letter,
        letterSpans: matchSpans(letter, entry.matched),
        letterFg: theme.peach,
        location,
        locationSpans: matchSpans(location, entry.matched, locationAt),
        locationFg: selected ? theme.text : theme.subtext1,
        text: entry.text,
        textSpans: matchSpans(entry.text, entry.matched, textAt),
        textFg: selected ? theme.subtext0 : theme.overlay0,
      }
    }
  )
}

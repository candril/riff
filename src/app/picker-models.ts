import type { AppState } from "../state"
import { filePickerModel } from "../components/file-picker-model"
import { commentsPickerModel } from "../components/comments-picker-model"
import { marksPickerModel } from "../components/marks-picker-model"
import { occurrencePickerModel } from "../components/occurrence-picker-model"
import { commitPickerModel } from "../components/commit-picker-model"
import { getFilteredFiles } from "../features/file-picker"
import { getFilteredEntries } from "../features/comments-picker"
import { marksPickerEntries } from "../features/marks"
import { getOccurrenceResults } from "../features/occurrence-picker"
import * as commitPicker from "../features/commit-picker"
import type { PickerSnapshots } from "./frame"

/** What each picker island draws on a terminal `width` by `height`, or null while it is closed. */
export function pickerModels(
  state: AppState,
  { filePicker, commentsPicker, occurrencePicker, marksPicker }: PickerSnapshots,
  width: number,
  height: number,
  now: Date
) {
  return {
    file: filePicker
      ? filePickerModel(getFilteredFiles(state, filePicker.query), filePicker.selectedIndex, height)
      : null,
    comments: commentsPicker
      ? commentsPickerModel(getFilteredEntries(state, commentsPicker.query), commentsPicker.selectedIndex, height)
      : null,
    marks: marksPicker
      ? marksPickerModel(
          marksPickerEntries(state.marks, state.files, marksPicker.query),
          marksPicker.selectedIndex,
          state.marks.marks.length > 0,
          height
        )
      : null,
    occurrence: occurrencePicker
      ? occurrencePickerModel(
          occurrencePicker.query,
          occurrencePicker.narrowing,
          getOccurrenceResults(state.files, occurrencePicker.query, occurrencePicker.filter),
          occurrencePicker.selectedIndex,
          height
        )
      : null,
    commit: state.commitPicker.open
      ? commitPickerModel(
          {
            commits: commitPicker.getFilteredCommits(state),
            selectedIndex: state.commitPicker.selectedIndex,
            viewingCommit: state.viewingCommit,
            marked: state.commitPicker.marked,
            filtering: state.commitPicker.queryInput,
            query: state.commitPicker.query,
            extending: state.commitPicker.rangeAnchor !== null,
          },
          width,
          height,
          now
        )
      : null,
  }
}

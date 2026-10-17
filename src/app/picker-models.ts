import type { AppState } from "../state"
import { filePickerModel } from "../components/file-picker-model"
import { commentsPickerModel } from "../components/comments-picker-model"
import { marksPickerModel } from "../components/marks-picker-model"
import { occurrencePickerModel } from "../components/occurrence-picker-model"
import { commitPickerModel } from "../components/commit-picker-model"
import * as filePicker from "../features/file-picker"
import * as commentsPicker from "../features/comments-picker"
import { marksPickerEntries } from "../features/marks"
import * as occurrencePicker from "../features/occurrence-picker"
import * as commitPicker from "../features/commit-picker"

/** What each picker island draws on a terminal `width` by `height`, or null while it is closed. */
export function pickerModels(state: AppState, width: number, height: number, now: Date) {
  return {
    file: state.filePicker.open
      ? filePickerModel(filePicker.getFilteredFiles(state), state.filePicker.selectedIndex, height)
      : null,
    comments: state.commentsPicker.open
      ? commentsPickerModel(commentsPicker.getFilteredEntries(state), state.commentsPicker.selectedIndex, height)
      : null,
    marks: state.marksPicker.open
      ? marksPickerModel(marksPickerEntries(state), state.marksPicker.selectedIndex, state.marks.marks.length > 0, height)
      : null,
    occurrence: state.occurrencePicker.open
      ? occurrencePickerModel(
          state.occurrencePicker.query,
          state.occurrencePicker.narrowing,
          occurrencePicker.getOccurrenceResults(state),
          state.occurrencePicker.selectedIndex,
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

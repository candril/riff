import { theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"
import { getFileColor } from "../utils/file-colors"
import { matchSpans, type MatchSpan } from "./match-spans"
import { pickerModel, type PickerModel, type PickerRow } from "./picker-window"

export interface FilteredFile {
  file: DiffFile
  index: number  // Original index in files array
  viewed?: boolean  // Whether file has been marked as viewed
  commentCount?: number  // Number of comments on this file
  /** Where the query matched the filename. */
  matched?: number[]
}

export interface FilePickerRow extends PickerRow {
  viewed: boolean
  name: string
  /** The name with what the query matched picked out. */
  nameSpans: MatchSpan[]
  nameFg: string
  /** How many comments the file has, or null for none. */
  comments: string | null
  stats: string
}

export type FilePickerModel = PickerModel<FilePickerRow>

export function filePickerModel(files: readonly FilteredFile[], selectedIndex: number, height: number): FilePickerModel {
  return pickerModel(files, selectedIndex, height, { title: "Find Files", hints: ["esc"], empty: null }, (item, selected) => {
    const { file, viewed = false, commentCount } = item
    const baseFg = selected ? theme.text : getFileColor(file.filename) || theme.subtext1
    return {
      id: String(item.index),
      selected,
      viewed,
      name: file.filename,
      nameSpans: matchSpans(file.filename, item.matched),
      nameFg: viewed && !selected ? theme.overlay0 : baseFg,
      comments: commentCount && commentCount > 0 ? String(commentCount) : null,
      stats: `+${file.additions} -${file.deletions}`,
    }
  })
}

import { theme, colors } from "../theme"
import type { CommentsPickerEntry } from "../features/comments-picker/filter"
import { pickerModel, type PickerModel, type PickerRow } from "./picker-window"

export interface CommentsPickerRow extends PickerRow {
  glyph: string
  glyphFg: string
  location: string
  locationFg: string
  preview: string
  previewFg: string
  /** "@author", or null for a comment with none. */
  author: string | null
}

export type CommentsPickerModel = PickerModel<CommentsPickerRow>

function statusGlyph(entry: CommentsPickerEntry): { glyph: string; fg: string } {
  if (!entry.isRoot) {
    return { glyph: "↳", fg: theme.overlay0 }
  }
  if (entry.threadResolved) {
    return { glyph: "✓", fg: colors.commentResolved }
  }
  switch (entry.comment.status) {
    case "local":
      return { glyph: "●", fg: colors.commentLocal }
    case "pending":
      return { glyph: "○", fg: colors.commentPending }
    case "synced":
      return { glyph: "·", fg: colors.commentSynced }
  }
}

export function commentsPickerModel(entries: readonly CommentsPickerEntry[], selectedIndex: number): CommentsPickerModel {
  return pickerModel(
    entries,
    selectedIndex,
    { title: "Find Comments", hints: ["esc"], empty: "No comments" },
    (entry, selected) => {
      const { glyph, fg } = statusGlyph(entry)
      return {
        id: entry.comment.id,
        selected,
        glyph,
        glyphFg: fg,
        location: `${entry.comment.filename}:${entry.comment.line}`,
        locationFg: selected ? theme.text : theme.subtext1,
        preview: entry.preview,
        previewFg: selected ? theme.subtext0 : theme.overlay0,
        author: entry.comment.author ? `@${entry.comment.author}` : null,
      }
    }
  )
}

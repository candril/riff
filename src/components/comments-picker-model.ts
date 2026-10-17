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

/** Local comments store their author as "@you"; GitHub's come without the "@". */
function authorHandle(author: string | undefined): string | null {
  if (!author) return null
  return author.startsWith("@") ? author : `@${author}`
}

export function commentsPickerModel(
  entries: readonly CommentsPickerEntry[],
  selectedIndex: number,
  height: number
): CommentsPickerModel {
  return pickerModel(
    entries,
    selectedIndex,
    height,
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
        author: authorHandle(entry.comment.author),
      }
    }
  )
}

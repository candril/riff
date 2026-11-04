import { theme, colors } from "../theme"
import type { CommentsPickerEntry } from "../features/comments-picker/filter"
import { matchSpans, type MatchSpan } from "./match-spans"
import { pickerModel, type PickerModel, type PickerRow } from "./picker-window"

export interface CommentsPickerRow extends PickerRow {
  glyph: string
  glyphFg: string
  location: string
  locationSpans: MatchSpan[]
  locationFg: string
  preview: string
  previewSpans: MatchSpan[]
  previewFg: string
  /** "@author", or null for a comment with none. */
  author: string | null
  authorSpans: MatchSpan[]
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

function positionsIn(entry: CommentsPickerEntry, field: "body" | "preview" | "filename" | "author"): number[] {
  return entry.matched?.field === field ? entry.matched.positions : []
}

/**
 * The preview is one line lifted out of the body, so the body's matches
 * land on it shifted by where it sits; a preview the body does not hold
 * verbatim (an image's stand-in) shows none.
 */
function previewSpans(entry: CommentsPickerEntry): MatchSpan[] {
  if (entry.matched?.field === "preview") return matchSpans(entry.preview, entry.matched.positions)
  const at = entry.comment.body.indexOf(entry.preview)
  return matchSpans(entry.preview, at === -1 ? [] : positionsIn(entry, "body"), at)
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
      const location = `${entry.comment.filename}:${entry.comment.line}`
      const author = authorHandle(entry.comment.author)
      return {
        id: entry.comment.id,
        selected,
        glyph,
        glyphFg: fg,
        location,
        locationSpans: matchSpans(location, positionsIn(entry, "filename")),
        locationFg: selected ? theme.text : theme.subtext1,
        preview: entry.preview,
        previewSpans: previewSpans(entry),
        previewFg: selected ? theme.subtext0 : theme.overlay0,
        author,
        authorSpans: author
          ? matchSpans(author, positionsIn(entry, "author"), (entry.comment.author?.length ?? 0) - author.length)
          : [],
      }
    }
  )
}

import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { PromptInput } from "./PromptInput"
import { theme } from "../theme"
import type { CommentsPickerEntry } from "../features/comments-picker"
import { commentsPickerModel, type CommentsPickerRow } from "./comments-picker-model"

export interface CommentsPickerProps {
  renderer: CliRenderer
  entries: CommentsPickerEntry[]
  selectedIndex: number
}

/**
 * Comments picker overlay (spec 044). PR-wide fuzzy search across every
 * comment in the diff. Modeled on FilePicker for visual consistency.
 */
export function CommentsPicker({ renderer, entries, selectedIndex }: CommentsPickerProps) {
  const model = commentsPickerModel(entries, selectedIndex)
  return Box(
    {
      id: "comments-picker-overlay",
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
    },
    Box({
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
      backgroundColor: "#00000080",
    }),
    Box(
      {
        position: "absolute",
        top: 2,
        left: "15%",
        width: "70%",
        flexDirection: "column",
        backgroundColor: theme.mantle,
      },
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ content: model.title, fg: theme.subtext0 }),
        Box(
          { flexDirection: "row", gap: 2 },
          Text({ content: model.count, fg: theme.overlay0 }),
          ...model.hints.map((hint) => Text({ content: hint, fg: theme.overlay0 }))
        )
      ),
      Box(
        {
          id: "comments-picker-search",
          flexDirection: "row",
          paddingX: 2,
          paddingBottom: 1,
          // One row, always: the shared input has no height of its own, and
          // a box that has to measure it can come out wrong when the field
          // has just moved here from another prompt.
          height: 1,
        },
        PromptInput(renderer, "comments-picker")
      ),
      Box(
        {
          flexDirection: "column",
          paddingBottom: 1,
        },
        model.above > 0
          ? Box(
              { paddingX: 2, height: 1 },
              Text({ content: `↑ ${model.above} more`, fg: theme.overlay0 })
            )
          : null,
        ...model.rows.map(CommentRow),
        model.below > 0
          ? Box(
              { paddingX: 2, height: 1 },
              Text({ content: `↓ ${model.below} more`, fg: theme.overlay0 })
            )
          : null,
        model.empty !== null
          ? Box(
              { paddingX: 2, height: 1 },
              Text({ content: model.empty, fg: theme.overlay0 })
            )
          : null
      )
    )
  )
}

function CommentRow(row: CommentsPickerRow) {
  return Box(
    {
      flexDirection: "row",
      backgroundColor: row.selected ? theme.surface2 : undefined,
      paddingX: 2,
      width: "100%",
    },
    Box(
      { flexDirection: "row", width: 2 },
      Text({ content: row.glyph, fg: row.glyphFg })
    ),
    Box(
      { flexDirection: "row", flexShrink: 0 },
      Text({ content: ` ${row.location} `, fg: row.locationFg })
    ),
    Box(
      { flexDirection: "row", flexGrow: 1 },
      Text({ content: row.preview, fg: row.previewFg })
    ),
    row.author !== null
      ? Box(
          { flexDirection: "row" },
          Text({ content: ` ${row.author}`, fg: theme.overlay0 })
        )
      : null
  )
}

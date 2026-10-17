import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { PromptInput } from "./PromptInput"
import { theme } from "../theme"
import type { MarkEntry } from "../features/marks"
import { marksPickerModel, type MarksPickerRow } from "./marks-picker-model"

export interface MarksPickerProps {
  renderer: CliRenderer
  entries: MarkEntry[]
  selectedIndex: number
  /** Whether any mark is set, filtered out or not: an empty list then says how to set one. */
  anyMarks: boolean
}

/** Every global mark (spec 101), laid out as CommentsPicker is. */
export function MarksPicker({ renderer, entries, selectedIndex, anyMarks }: MarksPickerProps) {
  const model = marksPickerModel(entries, selectedIndex, anyMarks)

  return Box(
    {
      id: "marks-picker-overlay",
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
        { flexDirection: "row", justifyContent: "space-between", paddingX: 2, paddingY: 1 },
        Text({ content: model.title, fg: theme.subtext0 }),
        Box(
          { flexDirection: "row", gap: 2 },
          Text({ content: model.count, fg: theme.overlay0 }),
          ...model.hints.map((hint) => Text({ content: hint, fg: theme.overlay0 }))
        )
      ),
      Box(
        // One row, always, as in CommentsPicker: the shared input has no height of its own.
        { id: "marks-picker-search", flexDirection: "row", paddingX: 2, paddingBottom: 1, height: 1 },
        PromptInput(renderer, "marks-picker")
      ),
      Box(
        { flexDirection: "column", paddingBottom: 1 },
        model.above > 0 ? note(`↑ ${model.above} more`) : null,
        ...model.rows.map(MarkRow),
        model.below > 0 ? note(`↓ ${model.below} more`) : null,
        model.empty !== null ? note(model.empty) : null
      )
    )
  )
}

function note(content: string) {
  return Box({ paddingX: 2, height: 1 }, Text({ content, fg: theme.overlay0 }))
}

function MarkRow(row: MarksPickerRow) {
  return Box(
    { flexDirection: "row", backgroundColor: row.selected ? theme.surface2 : undefined, paddingX: 2, width: "100%" },
    Box({ flexDirection: "row", width: 2 }, Text({ content: row.letter, fg: row.letterFg })),
    Box({ flexDirection: "row", flexShrink: 0 }, Text({ content: ` ${row.location} `, fg: row.locationFg })),
    Box({ flexDirection: "row", flexGrow: 1 }, Text({ content: row.text, fg: row.textFg }))
  )
}

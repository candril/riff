import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { PromptInput } from "./PromptInput"
import { theme } from "../theme"
import type { AllCommitsRow as AllCommitsRowModel, CommitPickerModel, CommitRow as CommitRowModel } from "./commit-picker-model"

export type { FilteredCommit } from "./commit-picker-model"

export interface CommitPickerProps {
  renderer: CliRenderer
  model: CommitPickerModel
}

const note = (content: string) => Box({ paddingX: 2, height: 1 }, Text({ content, fg: theme.overlay0 }))

/**
 * Commit picker overlay for selecting a commit to filter the diff
 */
export function CommitPicker({ renderer, model }: CommitPickerProps) {
  return Box(
    {
      id: "commit-picker-overlay",
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
    },
    // Dim background overlay
    Box({
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
      backgroundColor: "#00000080",
    }),
    // Commit picker centered
    Box(
      {
        position: "absolute",
        top: 2,
        left: "20%",
        width: "60%",
        flexDirection: "column",
        backgroundColor: theme.mantle,
      },
      // Header row
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ content: model.title, fg: theme.subtext0 }),
        Text({ content: model.hints.join("  "), fg: theme.overlay0 })
      ),
      Box(
        {
          id: "commit-picker-search",
          flexDirection: "row",
          paddingX: 2,
          paddingBottom: 1,
          // One row, always: the shared input has no height of its own, and
          // a box that has to measure it can come out wrong when the field
          // has just moved here from another prompt.
          height: 1,
        },
        model.filtering
          ? Box(
              { flexDirection: "row", flexGrow: 1 },
              Text({ content: "/", fg: theme.subtext0 }),
              PromptInput(renderer, "commit-picker")
            )
          : Text({ content: model.fieldText, fg: model.fieldFg })
      ),
      // Items list
      Box(
        { flexDirection: "column", paddingBottom: 1 },
        model.above > 0 ? note(`↑ ${model.above} more`) : null,
        ...model.rows.map((row) => (row.kind === "all" ? AllCommitsRow(row) : CommitRow(row))),
        model.below > 0 ? note(`↓ ${model.below} more`) : null
      ),
      // Footer hints
      Box(
        {
          flexDirection: "row",
          paddingX: 2,
          paddingTop: 1,
        },
        Text({ content: model.keys, fg: theme.overlay0 })
      )
    )
  )
}

function AllCommitsRow(row: AllCommitsRowModel) {
  const bg = row.selected ? "#585b70" : undefined
  return Box(
    {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: bg,
      paddingX: 2,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    Box(
      { flexDirection: "row" },
      Text({ content: row.active ? "● " : "  ", fg: theme.green }),
      Text({ content: "All commits", fg: row.labelFg })
    ),
    Text({ content: row.total, fg: theme.overlay0 })
  )
}

/**
 * One row, one line. Without a fixed height a long subject wraps and the
 * column then compresses the rows into each other — two commits drawn on
 * the same screen line, letter by letter.
 */
function CommitRow(row: CommitRowModel) {
  // A marked row is coloured, not badged: a column of bars reads as a
  // decoration, a block of colour reads as a selection (spec 078).
  const bg = row.selected ? "#585b70" : row.marked ? theme.surface0 : undefined
  return Box(
    {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: bg,
      paddingX: 2,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    Box(
      { flexDirection: "row", flexShrink: 1, overflow: "hidden" },
      Text({ content: row.active ? "● " : "  ", fg: theme.green }),
      Text({ content: row.sha, fg: row.shaFg }),
      Text({ content: "  ", fg: theme.overlay0 }),
      Text({ content: row.message, fg: row.messageFg })
    ),
    Box(
      // paddingLeft keeps a gap when the subject is long enough to shrink
      // into it — without one the message runs straight into the author.
      { flexDirection: "row", flexShrink: 0, paddingLeft: 2 },
      row.note ? Text({ content: `${row.note}  `, fg: theme.overlay0 }) : null,
      Text({ content: row.author, fg: theme.overlay0 }),
      Text({ content: `  ${row.time}`, fg: theme.overlay0 })
    )
  )
}

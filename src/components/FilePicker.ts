import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { PromptInput } from "./PromptInput"
import { theme } from "../theme"
import { filePickerModel, type FilePickerRow, type FilteredFile } from "./file-picker-model"

export type { FilteredFile } from "./file-picker-model"

export interface FilePickerProps {
  renderer: CliRenderer
  files: FilteredFile[]
  selectedIndex: number
}

/**
 * File picker overlay for fuzzy file search
 * Styled similar to ActionMenu. Shows a scrolling window of all files.
 */
export function FilePicker({ renderer, files, selectedIndex }: FilePickerProps) {
  const model = filePickerModel(files, selectedIndex)

  return Box(
    {
      id: "file-picker-overlay",
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
    // File picker centered
    Box(
      {
        position: "absolute",
        top: 2,
        left: "25%",
        width: "50%",
        flexDirection: "column",
        backgroundColor: theme.mantle,
      },
      // Header row: Find Files + count + esc
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
          ...model.hints.map((hint) => Text({ content: hint, fg: theme.overlay0 })),
        )
      ),
      Box(
        {
          id: "file-picker-search",
          flexDirection: "row",
          paddingX: 2,
          paddingBottom: 1,
          height: 1,
        },
        PromptInput(renderer, "file-picker")
      ),
      // Files list (scrolling window)
      Box(
        { 
          flexDirection: "column",
          paddingBottom: 1,
        },
        // Scroll indicator at top
        model.above > 0
          ? Box(
              { paddingX: 2, height: 1 },
              Text({ content: `↑ ${model.above} more`, fg: theme.overlay0 })
            )
          : null,
        ...model.rows.map(FileRow),
        // Scroll indicator at bottom
        model.below > 0
          ? Box(
              { paddingX: 2, height: 1 },
              Text({ content: `↓ ${model.below} more`, fg: theme.overlay0 })
            )
          : null,
      ),
    )
  )
}

function FileRow(row: FilePickerRow) {
  const bg = row.selected ? "#585b70" : undefined  // surface2 for selection

  return Box(
    { 
      flexDirection: "row", 
      justifyContent: "space-between",
      backgroundColor: bg, 
      paddingX: 2,
      width: "100%",
    },
    // Left side: filename with optional viewed indicator
    Box(
      { flexDirection: "row", flexGrow: 1 },
      row.viewed
        ? Text({ content: "✓ ", fg: theme.green })
        : null,
      Text({ content: row.name, fg: row.nameFg })
    ),
    // Right side: comment count and stats
    Box(
      { flexDirection: "row" },
      row.comments !== null
        ? Text({ content: `${row.comments} `, fg: theme.blue })
        : null,
      Text({ content: row.stats, fg: theme.overlay0 })
    )
  )
}

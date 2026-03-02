import { Box, Text } from "@opentui/core"
import { theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"
import { getFileColor } from "../utils/file-colors"

export interface FilePickerProps {
  query: string
  files: FilteredFile[]
  selectedIndex: number
}

export interface FilteredFile {
  file: DiffFile
  index: number  // Original index in files array
}

/**
 * File picker overlay for fuzzy file search
 * Styled similar to ActionMenu
 */
export function FilePicker({ query, files, selectedIndex }: FilePickerProps) {
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
      // Header row: Find Files + esc
      Box(
        { 
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ content: "Find Files", fg: theme.subtext0 }),
        Text({ content: "esc", fg: theme.overlay0 })
      ),
      // Search input - placeholder or query text
      Box(
        { 
          id: "file-picker-search",
          flexDirection: "row",
          paddingX: 2,
          paddingBottom: 1,
        },
        query
          ? Text({ content: query, fg: theme.text })
          : Text({ content: "Type to search...", fg: theme.overlay0 })
      ),
      // Files list
      Box(
        { 
          flexDirection: "column",
          paddingBottom: 1,
          maxHeight: 15,
        },
        ...files.slice(0, 15).map((item, i) => 
          FileRow({ 
            file: item.file, 
            selected: i === selectedIndex 
          })
        ),
        // Show count if more files
        files.length > 15
          ? Box(
              { paddingX: 2 },
              Text({ 
                content: `... and ${files.length - 15} more`, 
                fg: theme.overlay0 
              })
            )
          : null
      ),
      // Footer hints
      Box(
        { 
          flexDirection: "row",
          paddingX: 2,
          paddingTop: 1,
        },
        Text({ content: "Ctrl+n/p: navigate  Enter: select", fg: theme.overlay0 })
      )
    )
  )
}

interface FileRowProps {
  file: DiffFile
  selected: boolean
}

function FileRow({ file, selected }: FileRowProps) {
  const bg = selected ? "#585b70" : undefined  // surface2 for selection
  // Use file type color, or default colors
  const fileColor = getFileColor(file.filename)
  const fg = selected ? theme.text : (fileColor || theme.subtext1)
  
  // Format additions/deletions
  const stats = `+${file.additions} -${file.deletions}`
  const statsFg = theme.overlay0
  
  return Box(
    { 
      flexDirection: "row", 
      justifyContent: "space-between",
      backgroundColor: bg, 
      paddingX: 2,
      width: "100%",
    },
    Text({ content: file.filename, fg }),
    Text({ content: stats, fg: statsFg })
  )
}

import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { PromptInput } from "./PromptInput"
import { theme } from "../theme"
import { markEntryLocation, type MarkEntry } from "../features/marks"

export interface MarksPickerProps {
  renderer: CliRenderer
  entries: MarkEntry[]
  selectedIndex: number
  /** Whether any mark is set, filtered out or not: an empty list then says how to set one. */
  anyMarks: boolean
}

const MAX_VISIBLE = 20

/** Every global mark (spec 101), laid out as CommentsPicker is. */
export function MarksPicker({ renderer, entries, selectedIndex, anyMarks }: MarksPickerProps) {
  const total = entries.length
  let startIndex = 0
  if (total > MAX_VISIBLE) {
    startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(MAX_VISIBLE / 2), total - MAX_VISIBLE))
  }
  const endIndex = Math.min(startIndex + MAX_VISIBLE, total)
  const visible = entries.slice(startIndex, endIndex)
  const countText = total > 0 ? `${selectedIndex + 1}/${total}` : "0"

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
        Text({ content: "Marks", fg: theme.subtext0 }),
        Box(
          { flexDirection: "row", gap: 2 },
          Text({ content: countText, fg: theme.overlay0 }),
          Text({ content: "^x delete", fg: theme.overlay0 }),
          Text({ content: "esc", fg: theme.overlay0 })
        )
      ),
      Box(
        // One row, always, as in CommentsPicker: the shared input has no height of its own.
        { id: "marks-picker-search", flexDirection: "row", paddingX: 2, paddingBottom: 1, height: 1 },
        PromptInput(renderer, "marks-picker")
      ),
      Box(
        { flexDirection: "column", paddingBottom: 1 },
        startIndex > 0 ? note(`↑ ${startIndex} more`) : null,
        ...visible.map((entry, i) => MarkRow(entry, startIndex + i === selectedIndex)),
        endIndex < total ? note(`↓ ${total - endIndex} more`) : null,
        total === 0 ? note(anyMarks ? "No matching marks" : "No marks — m{letter} sets one") : null
      )
    )
  )
}

function note(content: string) {
  return Box({ paddingX: 2, height: 1 }, Text({ content, fg: theme.overlay0 }))
}

function MarkRow(entry: MarkEntry, selected: boolean) {
  const baseFg = selected ? theme.text : theme.subtext1
  const dimFg = selected ? theme.subtext0 : theme.overlay0

  return Box(
    { flexDirection: "row", backgroundColor: selected ? theme.surface2 : undefined, paddingX: 2, width: "100%" },
    Box({ flexDirection: "row", width: 2 }, Text({ content: entry.mark.letter, fg: theme.peach })),
    Box({ flexDirection: "row", flexShrink: 0 }, Text({ content: ` ${markEntryLocation(entry)} `, fg: baseFg })),
    Box({ flexDirection: "row", flexGrow: 1 }, Text({ content: entry.text, fg: dimFg }))
  )
}

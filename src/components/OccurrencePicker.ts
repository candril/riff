import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { PromptInput } from "./PromptInput"
import { theme, colors } from "../theme"
import type { OccurrenceGroup, OccurrenceHit, OccurrenceResults } from "../features/occurrence-picker"

export interface OccurrencePickerProps {
  renderer: CliRenderer
  query: string
  results: OccurrenceResults
  selectedIndex: number
}

const MAX_VISIBLE = 20

/** A match further right than this is scrolled into view with a leading `…`. */
const LEAD = 48

type DisplayRow =
  | { kind: "file"; group: OccurrenceGroup }
  | { kind: "hit"; hit: OccurrenceHit; index: number }

/**
 * Occurrence picker overlay (spec 088): every row of the diff the query
 * hits, under a header per file. Modeled on CommentsPicker.
 */
export function OccurrencePicker({ renderer, query, results, selectedIndex }: OccurrencePickerProps) {
  const rows: DisplayRow[] = []
  let selectedRow = 0
  let hitIndex = 0
  for (const group of results.groups) {
    rows.push({ kind: "file", group })
    for (const hit of group.hits) {
      if (hitIndex === selectedIndex) selectedRow = rows.length
      rows.push({ kind: "hit", hit, index: hitIndex++ })
    }
  }

  const total = rows.length
  let startIndex = 0
  if (total > MAX_VISIBLE) {
    startIndex = Math.max(0, Math.min(selectedRow - Math.floor(MAX_VISIBLE / 2), total - MAX_VISIBLE))
  }
  const endIndex = Math.min(startIndex + MAX_VISIBLE, total)
  const visible = rows.slice(startIndex, endIndex)

  // A file header scrolled off the top would leave its hits unattributed.
  const first = visible[0]
  if (first?.kind === "hit") {
    const group = results.groups.find((g) => g.hits.includes(first.hit))
    if (group) visible[0] = { kind: "file", group }
  }

  return Box(
    {
      id: "occurrence-picker-overlay",
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
        left: "10%",
        width: "80%",
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
        Text({ content: "Occurrences", fg: theme.subtext0 }),
        Box(
          { flexDirection: "row", gap: 2 },
          Text({ content: countText(query, results), fg: theme.overlay0 }),
          Text({ content: "esc", fg: theme.overlay0 })
        )
      ),
      Box(
        {
          id: "occurrence-picker-search",
          flexDirection: "row",
          paddingX: 2,
          paddingBottom: 1,
          height: 1,
        },
        PromptInput(renderer, "occurrence-picker")
      ),
      Box(
        { flexDirection: "column", paddingBottom: 1 },
        startIndex > 0
          ? Box({ paddingX: 2, height: 1 }, Text({ content: `↑ ${startIndex} more`, fg: theme.overlay0 }))
          : null,
        ...visible.map((row) =>
          row.kind === "file"
            ? FileRow(row.group)
            : HitRow(row.hit, row.index === selectedIndex)
        ),
        endIndex < total
          ? Box({ paddingX: 2, height: 1 }, Text({ content: `↓ ${total - endIndex} more`, fg: theme.overlay0 }))
          : null,
        query && total === 0
          ? Box({ paddingX: 2, height: 1 }, Text({ content: "No matches in the diff", fg: theme.overlay0 }))
          : null
      )
    )
  )
}

function countText(query: string, results: OccurrenceResults): string {
  if (!query) return ""
  const files = `${results.fileCount} file${results.fileCount === 1 ? "" : "s"}`
  if (results.capped) return `first ${results.hits.length} of ${results.total} in ${files}`
  return `${results.total} in ${files}`
}

function FileRow(group: OccurrenceGroup) {
  return Box(
    {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingX: 2,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    Text({ content: group.filename, fg: theme.blue }),
    Text({ content: String(group.count), fg: theme.overlay0 })
  )
}

function HitRow(hit: OccurrenceHit, selected: boolean) {
  const { row } = hit
  const marker = row.kind === "addition" ? "+" : row.kind === "deletion" ? "-" : " "
  const markerFg = row.kind === "addition" ? colors.addedFg : row.kind === "deletion" ? colors.removedFg : theme.overlay0
  const textFg = selected ? theme.text : theme.subtext1
  const { before, match, after } = excerpt(row.text, hit.startCol, hit.endCol)

  return Box(
    {
      flexDirection: "row",
      backgroundColor: selected ? theme.surface2 : undefined,
      paddingX: 2,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    Text({ content: String(row.lineNum).padStart(6), fg: theme.overlay0 }),
    Text({ content: ` ${marker} `, fg: markerFg }),
    Text({ content: before, fg: textFg }),
    Text({ content: match, fg: theme.crust, bg: theme.yellow }),
    Text({ content: after, fg: textFg })
  )
}

/**
 * The row's text around its first match, indentation dropped. A match far
 * to the right is brought into view: the list is narrower than the code.
 */
export function excerpt(
  text: string,
  startCol: number,
  endCol: number
): { before: string; match: string; after: string } {
  const indent = text.length - text.trimStart().length
  const from = Math.min(indent, startCol)
  let before = text.slice(from, startCol)
  if (before.length > LEAD) before = `…${before.slice(before.length - LEAD + 1)}`
  return { before, match: text.slice(startCol, endCol), after: text.slice(endCol) }
}

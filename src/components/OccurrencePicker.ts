import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { PromptInput } from "./PromptInput"
import { theme } from "../theme"
import type { Segment } from "./occurrence-excerpt"
import type { OccurrenceFileRow, OccurrenceHitRow, OccurrencePickerModel } from "./occurrence-picker-model"

export interface OccurrencePickerProps {
  renderer: CliRenderer
  model: OccurrencePickerModel
}

const note = (content: string) => Box({ paddingX: 2, height: 1 }, Text({ content, fg: theme.overlay0 }))

/**
 * Occurrence picker overlay (spec 088): every row of the diff the query
 * hits, under a header per file. Modeled on CommentsPicker.
 */
export function OccurrencePicker({ renderer, model }: OccurrencePickerProps) {
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
        Box(
          { flexDirection: "row", gap: 2 },
          Text({ content: model.title, fg: theme.subtext0 }),
          model.badge ? Text({ content: model.badge, fg: theme.yellow }) : null
        ),
        Box({ flexDirection: "row", gap: 2 }, ...model.hints.map((hint) => Text({ content: hint, fg: theme.overlay0 })))
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
        model.above > 0 ? note(`↑ ${model.above} more`) : null,
        ...model.rows.map((row) => (row.kind === "file" ? FileRow(row) : HitRow(row))),
        model.below > 0 ? note(`↓ ${model.below} more`) : null,
        model.empty ? note(model.empty) : null
      )
    )
  )
}

function FileRow(row: OccurrenceFileRow) {
  return Box(
    {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingX: 2,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    Box({ flexDirection: "row" }, ...row.name.map((seg) => SegmentText(seg, theme.blue))),
    Text({ content: row.count, fg: theme.overlay0 })
  )
}

function HitRow(row: OccurrenceHitRow) {
  return Box(
    {
      flexDirection: "row",
      backgroundColor: row.selected ? theme.surface2 : undefined,
      paddingX: 2,
      width: "100%",
      height: 1,
      overflow: "hidden",
    },
    Text({ content: row.lineNum, fg: theme.overlay0 }),
    Text({ content: ` ${row.marker} `, fg: row.markerFg }),
    ...row.excerpt.map((seg) => SegmentText(seg, row.textFg))
  )
}

function SegmentText(seg: Segment, fg: string) {
  if (seg.mark === "match") return Text({ content: seg.text, fg: theme.crust, bg: theme.yellow })
  if (seg.mark === "narrow") return Text({ content: seg.text, fg: theme.crust, bg: theme.teal })
  return Text({ content: seg.text, fg })
}

import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { colors, theme } from "../theme"
import { PromptInput } from "./PromptInput"
import type { FeedEvent } from "../utils/feed"
import type { FeedRow, FeedState } from "../state"
import {
  FILE_INDENT,
  feedModel,
  type FeedEventRow,
  type FeedFileRow,
  type FeedHeader,
  type FeedLegend,
  type FeedTone,
} from "./feed-model"

export interface FeedViewProps {
  /** The events the filters left, newest first. */
  events: FeedEvent[]
  /** The same, as drawn: a commit's files sit under it once it is open. */
  rows: FeedRow[]
  feed: FeedState
  /** Comments that arrived since the last visit (spec 069). */
  unseenIds: ReadonlySet<string>
  /** Flash labels by row index, while `s` is labelling (spec 066). */
  flashLabels: ReadonlyMap<string, string>
  renderer: CliRenderer
  loading: boolean
}

const TONE: Record<FeedTone, string> = {
  text: colors.text,
  dim: colors.textDim,
  subtext0: theme.subtext0,
  subtext1: theme.subtext1,
  green: theme.green,
  red: theme.red,
  peach: theme.peach,
  mauve: theme.mauve,
  yellow: theme.yellow,
}

/** The activity feed (spec 070), drawn from its model. */
export function FeedView({ renderer, ...input }: FeedViewProps) {
  const model = feedModel({ ...input, now: Date.now() })
  return Box(
    {
      id: "feed-view",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      paddingTop: 1,
      paddingLeft: 2,
      paddingRight: 2,
    },
    header(model.header),
    legendRow(model.legend, renderer),
    Box({ height: 1 }, Text({ content: "─".repeat(78), fg: theme.surface1 })),
    ...(model.empty !== null
      ? [Text({ content: model.empty, fg: colors.textDim })]
      : model.rows.map((row) =>
          row.kind === "event"
            ? eventRow(row)
            : row.kind === "file"
              ? fileRow(row)
              : Box(
                  { flexDirection: "row", height: 1 },
                  Text({ content: `${" ".repeat(FILE_INDENT)}loading…`, fg: colors.textDim })
                )
        ))
  )
}

function header(model: FeedHeader) {
  return Box(
    { flexDirection: "row", height: 1, width: "100%" },
    Text({ content: "Feed", fg: colors.headerFg }),
    Text({ content: `   ${model.countText} · ${model.scope}${model.loadingSuffix}`, fg: colors.textDim }),
    Text({ content: "  ", fg: colors.textDim }),
    model.unseenCount > 0
      ? Text({ content: `● ${model.unseenCount} unseen`, fg: theme.blue })
      : Text({ content: "", fg: colors.textDim })
  )
}

function legendRow(legend: FeedLegend, renderer: CliRenderer) {
  if (legend.filterInput) {
    return Box(
      { flexDirection: "row", height: 1, width: "100%" },
      Text({ content: "/", fg: colors.secondary }),
      PromptInput(renderer, "feed-filter")
    )
  }

  // A toggle that is on is said in full colour, one that is off in dim —
  // the key letter is the only accent, so the row reads as a legend.
  return Box(
    { flexDirection: "row", height: 1, width: "100%" },
    ...legend.toggles.flatMap(({ key, label, on }) => [
      Text({ content: ` ${key} `, fg: on ? theme.peach : colors.textDim }),
      Text({ content: `${label}   `, fg: on ? colors.text : colors.textDim }),
    ]),
    Text({ content: " / ", fg: colors.textDim }),
    Text({ content: legend.filter ? `${legend.filter}   ` : "filter   ", fg: legend.filter ? colors.text : colors.textDim }),
    legend.narrowed
      ? Text({ content: " esc all", fg: colors.textDim })
      : Text({ content: "", fg: colors.textDim })
  )
}

function eventRow(row: FeedEventRow) {
  return Box(
    {
      flexDirection: "row",
      height: 1,
      width: "100%",
      backgroundColor: row.selected ? theme.surface1 : undefined,
    },
    Box(
      { flexDirection: "row", flexShrink: 0 },
      Text({ content: row.flashCell, fg: colors.flashLabel }),
      Text({ content: row.timeCell, fg: colors.textDim }),
      // One cell for the row's state: new to you, or answered.
      row.state === "unseen"
        ? Text({ content: " ● ", fg: theme.blue })
        : row.state === "resolved"
          ? Text({ content: " ✓ ", fg: theme.green })
          : Text({ content: "   ", fg: theme.blue }),
      Text({ content: row.typeLabel, fg: TONE[row.typeTone] }),
      Text({ content: row.actorCell, fg: theme.subtext0 }),
      Text({ content: row.leadCell, fg: colors.textDim })
    ),
    Box(
      { flexDirection: "row", flexGrow: 1, flexShrink: 1, overflow: "hidden" },
      Text({ content: row.title, fg: TONE[row.titleTone] }),
      row.note
        ? Text({ content: `  ${row.note}`, fg: colors.textDim })
        : Text({ content: "", fg: colors.textDim })
    ),
    row.trailing
      ? Box(
          { flexDirection: "row", flexShrink: 0 },
          Text({ content: `  ${row.trailing}`, fg: TONE[row.trailingTone] })
        )
      : null
  )
}

/** One file of an opened commit — a row of its own, so it can be picked. */
function fileRow(row: FeedFileRow) {
  return Box(
    {
      flexDirection: "row",
      height: 1,
      width: "100%",
      backgroundColor: row.selected ? theme.surface1 : undefined,
    },
    Text({ content: row.flashCell, fg: colors.flashLabel }),
    Text({
      content: `${" ".repeat(FILE_INDENT - 2)}${row.branch} ${row.filename}`,
      fg: row.selected ? colors.text : theme.subtext0,
    }),
    Text({ content: `  +${row.additions}`, fg: theme.green }),
    Text({ content: ` -${row.deletions}`, fg: theme.red })
  )
}

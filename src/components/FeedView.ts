import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { colors, theme } from "../theme"
import { PromptInput } from "./PromptInput"
import { FEED_TYPES, type FeedEvent } from "../utils/feed"
import type { CommitFileSummary, FeedRow, FeedState } from "../state"

export interface FeedViewProps {
  /** The events the filters left, newest first. */
  events: FeedEvent[]
  /** The same, as drawn: a commit's files sit under it once it is open. */
  rows: FeedRow[]
  feed: FeedState
  /** Comments that arrived since the last visit (spec 069). */
  unseenIds: ReadonlySet<string>
  /** Flash labels by row index, while `s` is labelling (spec 066). */
  flashLabels: ReadonlyMap<number, string>
  renderer: CliRenderer
  loading: boolean
}

const TYPE_LABEL: Record<FeedEvent["type"], string> = {
  commit: "commit",
  comment: "comment",
  review: "review",
  check: "check",
  push: "push",
  ready: "ready",
}

/**
 * The activity feed (spec 070) — one row per event, newest first: what
 * happened to this PR, and what happened since you left.
 */
export function FeedView({
  events,
  rows,
  feed,
  unseenIds,
  flashLabels,
  renderer,
  loading,
}: FeedViewProps) {
  const leadWidth = leadWidthFor(events)
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
    header(events, feed, unseenIds, loading),
    filterRow(feed, renderer),
    Box({ height: 1 }, Text({ content: "─".repeat(78), fg: theme.surface1 })),
    ...(events.length === 0
      ? [
          Text({
            content: loading ? "Reading the timeline…" : "Nothing matches — `0` shows everything",
            fg: colors.textDim,
          }),
        ]
      : rows.flatMap((row, index) =>
          row.kind === "file"
            ? [fileRow(row, index, feed, flashLabels)]
            : eventRows(row.event, index, previousEvent(rows, index), feed, unseenIds, flashLabels, leadWidth)
        ))
  )
}

function header(
  events: FeedEvent[],
  feed: FeedState,
  unseenIds: ReadonlySet<string>,
  loading: boolean
) {
  const unseenCount = events.filter(
    (event) => event.target?.kind === "comment" && unseenIds.has(event.target.commentId)
  ).length
  const scope = feed.types.size === 0 ? "all types" : [...feed.types].join(" · ")

  return Box(
    { flexDirection: "row", height: 1, width: "100%" },
    Text({ content: "Feed", fg: colors.headerFg }),
    Text({
      content: `   ${events.length} event${events.length === 1 ? "" : "s"} · ${scope}${loading ? " · loading" : ""}`,
      fg: colors.textDim,
    }),
    Text({ content: "  ", fg: colors.textDim }),
    unseenCount > 0
      ? Text({ content: `● ${unseenCount} unseen`, fg: theme.blue })
      : Text({ content: "", fg: colors.textDim })
  )
}

function filterRow(feed: FeedState, renderer: CliRenderer) {
  if (feed.filterInput) {
    return Box(
      { flexDirection: "row", height: 1, width: "100%" },
      Text({ content: "/", fg: colors.secondary }),
      PromptInput(renderer, "feed-filter")
    )
  }

  // A toggle that is on is said in full colour, one that is off in dim —
  // the key letter is the only accent, so the row reads as a legend.
  const toggle = (key: string, label: string, on: boolean) => [
    Text({ content: ` ${key} `, fg: on ? theme.peach : colors.textDim }),
    Text({ content: `${label}   `, fg: on ? colors.text : colors.textDim }),
  ]
  const narrowed = feed.types.size > 0 || feed.unseenOnly || feed.filter.length > 0

  return Box(
    { flexDirection: "row", height: 1, width: "100%" },
    ...FEED_TYPES.flatMap(({ key, type, label }) => toggle(key, label, feed.types.has(type))),
    ...toggle("u", "unseen", feed.unseenOnly),
    Text({ content: " / ", fg: colors.textDim }),
    Text({ content: feed.filter ? `${feed.filter}   ` : "filter   ", fg: feed.filter ? colors.text : colors.textDim }),
    narrowed
      ? Text({ content: " esc all", fg: colors.textDim })
      : Text({ content: "", fg: colors.textDim })
  )
}

/** Column widths, in cells. The actor gets an ellipsis, never a collision. */
const TIME_WIDTH = 4
const TYPE_WIDTH = 9
const ACTOR_WIDTH = 13

function eventRows(
  event: FeedEvent,
  index: number,
  previous: FeedEvent | undefined,
  feed: FeedState,
  unseenIds: ReadonlySet<string>,
  flashLabels: ReadonlyMap<number, string>,
  leadWidth: number
) {
  const selected = index === feed.highlightIndex
  const unseen = event.target?.kind === "comment" && unseenIds.has(event.target.commentId)
  const label = flashLabels.get(index)

  // The time is a gutter, not a column: it is only written where it changes,
  // so thirty rows from the same hour read as one group rather than thirty
  // repetitions of "3h".
  const time = timeAgo(event.at)
  const timeCell = previous && timeAgo(previous.at) === time ? "" : time

  const cells = [
    Text({ content: label ? `${label} ` : "  ", fg: colors.flashLabel }),
    Text({ content: timeCell.padStart(TIME_WIDTH), fg: colors.textDim }),
    // One cell for the row's state: new to you, or answered.
    unseen
      ? Text({ content: " ● ", fg: theme.blue })
      : event.resolved
        ? Text({ content: " ✓ ", fg: theme.green })
        : Text({ content: "   ", fg: theme.blue }),
    Text({ content: TYPE_LABEL[event.type].padEnd(TYPE_WIDTH), fg: typeColor(event.type) }),
  ]
  // Both columns are reserved on every row and blank where there is nothing
  // to say — a check has no actor, a review no file — so the words start on
  // one straight edge whatever the row is about.
  // A commit row can open into its files, and says so in front of its sha.
  const foldable = event.target?.kind === "commit"
  const fold = foldable ? (feed.expandedIds.has(event.id) ? "▾ " : "▸ ") : ""
  cells.push(
    Text({ content: fitRight(actorLabel(event.actor), ACTOR_WIDTH) + "  ", fg: theme.subtext0 }),
    Text({ content: fitLeft(fold + (event.lead ?? ""), leadWidth) + "  ", fg: colors.textDim })
  )

  const rows = [
    Box(
      {
        flexDirection: "row",
        height: 1,
        width: "100%",
        backgroundColor: selected ? theme.surface1 : undefined,
      },
      Box({ flexDirection: "row", flexShrink: 0 }, ...cells),
      Box(
        { flexDirection: "row", flexGrow: 1, flexShrink: 1, overflow: "hidden" },
        Text({
          content: event.title,
          // An answered comment reads as settled — dimmer, not gone.
          fg: selected ? colors.text : event.resolved ? colors.textDim : theme.subtext1,
        }),
        event.note
          ? Text({ content: `  ${event.note}`, fg: colors.textDim })
          : Text({ content: "", fg: colors.textDim })
      ),
      event.trailing
        ? Box(
            { flexDirection: "row", flexShrink: 0 },
            Text({
              content: `  ${event.trailing}`,
              fg: event.trailing.startsWith("✓") ? theme.green : event.trailing.startsWith("✗") ? theme.red : colors.textDim,
            })
          )
        : null
    ),
  ]

  // Opened before its files have arrived: say so, on a line that is not a
  // row — there is nothing to land on yet.
  if (foldable && feed.expandedIds.has(event.id) && event.target?.kind === "commit" && !feed.commitFiles.has(event.target.sha)) {
    rows.push(
      Box(
        { flexDirection: "row", height: 1 },
        Text({ content: `${" ".repeat(FILE_INDENT)}loading…`, fg: colors.textDim })
      )
    )
  }

  return rows
}

const FILE_INDENT = 2 + TIME_WIDTH + 3 + TYPE_WIDTH + ACTOR_WIDTH + 2

/** One file of an opened commit — a row of its own, so it can be picked. */
function fileRow(
  row: Extract<FeedRow, { kind: "file" }>,
  index: number,
  feed: FeedState,
  flashLabels: ReadonlyMap<number, string>
) {
  const selected = index === feed.highlightIndex
  const label = flashLabels.get(index)
  return Box(
    {
      flexDirection: "row",
      height: 1,
      width: "100%",
      backgroundColor: selected ? theme.surface1 : undefined,
    },
    Text({ content: label ? `${label} ` : "  ", fg: colors.flashLabel }),
    Text({
      content: `${" ".repeat(FILE_INDENT - 2)}${row.last ? "└" : "├"} ${row.file.filename}`,
      fg: selected ? colors.text : theme.subtext0,
    }),
    Text({ content: `  +${row.file.additions}`, fg: theme.green }),
    Text({ content: ` -${row.file.deletions}`, fg: theme.red })
  )
}

/** The event above this row, for the time gutter's "only where it changes". */
function previousEvent(rows: FeedRow[], index: number): FeedEvent | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const row = rows[i]!
    if (row.kind === "event") return row.event
  }
  return undefined
}

/** Cut from the right, with an ellipsis — for names. */
/** A local comment's author is stored as `@you`, so the `@` is not added twice. */
function actorLabel(actor: string | undefined): string {
  if (!actor) return ""
  return actor.startsWith("@") ? actor : `@${actor}`
}

function fitRight(text: string, width: number): string {
  const w = Bun.stringWidth(text)
  if (w <= width) return text + " ".repeat(width - w)
  let out = ""
  for (const ch of text) {
    if (Bun.stringWidth(out + ch) > width - 1) break
    out += ch
  }
  return out + "…" + " ".repeat(Math.max(0, width - Bun.stringWidth(out) - 1))
}

/** Cut from the left, with an ellipsis — for paths, whose tail is the name. */
function fitLeft(text: string, width: number): string {
  const w = Bun.stringWidth(text)
  if (w <= width) return text + " ".repeat(width - w)
  let out = ""
  for (const ch of [...text].reverse()) {
    if (Bun.stringWidth(ch + out) > width - 1) break
    out = ch + out
  }
  return "…" + out + " ".repeat(Math.max(0, width - Bun.stringWidth(out) - 1))
}

/**
 * The lead column is as wide as the longest lead on screen, within reason:
 * a `file:line` column that grows to fit a 70-character path would push
 * every row's words off the right edge.
 */
function leadWidthFor(events: FeedEvent[]): number {
  let widest = 0
  for (const event of events) {
    if (!event.lead) continue
    // A commit's lead carries its fold mark in front of the sha.
    const fold = event.target?.kind === "commit" ? 2 : 0
    widest = Math.max(widest, Bun.stringWidth(event.lead) + fold)
  }
  return Math.min(36, Math.max(8, widest))
}

function typeColor(type: FeedEvent["type"]): string {
  switch (type) {
    case "commit":
      return theme.peach
    case "comment":
      return theme.mauve
    case "review":
      return theme.green
    case "check":
      return theme.yellow
    case "push":
      return theme.red
    default:
      return theme.subtext0
  }
}

/** Short relative time — the feed is a column of them, so they stay narrow. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const minutes = Math.floor((Date.now() - then) / 60000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  return months < 12 ? `${months}mo` : `${Math.floor(days / 365)}y`
}

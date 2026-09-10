import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { colors, theme } from "../theme"
import { PromptInput } from "./PromptInput"
import { FEED_TYPES, type FeedEvent } from "../utils/feed"
import type { CommitFileSummary, FeedState } from "../state"

export interface FeedViewProps {
  /** The events the filters left, newest first. */
  events: FeedEvent[]
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
  thread: "resolved",
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
      : events.flatMap((event, index) =>
          eventRows(event, index, events[index - 1], feed, unseenIds, flashLabels, leadWidth)
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
      PromptInput(renderer)
    )
  }

  const toggle = (key: string, label: string, on: boolean) => [
    Text({ content: ` ${key} `, fg: on ? theme.base : theme.peach, bg: on ? theme.peach : undefined }),
    Text({ content: `${label}   `, fg: on ? colors.text : colors.textDim }),
  ]
  const narrowed = feed.types.size > 0 || feed.unseenOnly || feed.filter.length > 0

  return Box(
    { flexDirection: "row", height: 1, width: "100%" },
    ...FEED_TYPES.flatMap(({ key, type, label }) => toggle(key, label, feed.types.has(type))),
    ...toggle("a", "all", !narrowed),
    ...toggle("u", "unseen", feed.unseenOnly),
    feed.filter
      ? Text({ content: ` /${feed.filter}`, fg: theme.peach })
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
    Text({ content: unseen ? " ● " : "   ", fg: theme.blue }),
    Text({ content: TYPE_LABEL[event.type].padEnd(TYPE_WIDTH), fg: typeColor(event.type) }),
  ]
  // A check has no actor; its name takes the column rather than leaving a
  // hole in front of it.
  if (event.actor !== undefined) {
    cells.push(Text({ content: fitRight(`@${event.actor}`, ACTOR_WIDTH) + "  ", fg: theme.subtext0 }))
  }
  if (event.lead !== undefined) {
    cells.push(Text({ content: fitLeft(event.lead, leadWidth) + "  ", fg: colors.textDim }))
  }

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
        Text({ content: event.title, fg: selected ? colors.text : theme.subtext1 }),
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

  // An expanded commit shows the files it touched, fetched when it opened.
  if (event.target?.kind === "commit" && feed.expandedIds.has(event.id)) {
    const files = feed.commitFiles.get(event.target.sha)
    rows.push(...commitFileRows(files))
  }

  return rows
}

/** Cut from the right, with an ellipsis — for names. */
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
    if (event.lead) widest = Math.max(widest, Bun.stringWidth(event.lead))
  }
  return Math.min(36, Math.max(8, widest))
}

function commitFileRows(files: readonly CommitFileSummary[] | undefined) {
  if (!files) {
    return [
      Box(
        { flexDirection: "row", height: 1 },
        Text({ content: `${" ".repeat(2 + TIME_WIDTH + 3 + TYPE_WIDTH + ACTOR_WIDTH + 2)}loading…`, fg: colors.textDim })
      ),
    ]
  }

  return files.map((file, index) =>
    Box(
      { flexDirection: "row", height: 1 },
      Text({
        content: `${" ".repeat(2 + TIME_WIDTH + 3 + TYPE_WIDTH + ACTOR_WIDTH + 2)}${index === files.length - 1 ? "└" : "├"} ${file.filename}`,
        fg: theme.subtext0,
      }),
      Text({ content: `  +${file.additions}`, fg: theme.green }),
      Text({ content: ` -${file.deletions}`, fg: theme.red })
    )
  )
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

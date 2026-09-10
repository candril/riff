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
      : events.flatMap((event, index) => eventRows(event, index, feed, unseenIds, flashLabels)))
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

  return Box(
    { flexDirection: "row", height: 1, width: "100%" },
    ...FEED_TYPES.map(({ key, type, label }) =>
      Text({
        content: `[${key}] ${label}  `,
        fg: feed.types.has(type) ? theme.blue : colors.textDim,
      })
    ),
    Text({ content: "[0] all  ", fg: feed.types.size === 0 ? theme.blue : colors.textDim }),
    Text({ content: "[u] unseen", fg: feed.unseenOnly ? theme.blue : colors.textDim }),
    feed.filter
      ? Text({ content: `   /${feed.filter}`, fg: theme.peach })
      : Text({ content: "", fg: colors.textDim })
  )
}

function eventRows(
  event: FeedEvent,
  index: number,
  feed: FeedState,
  unseenIds: ReadonlySet<string>,
  flashLabels: ReadonlyMap<number, string>
) {
  const selected = index === feed.highlightIndex
  const unseen = event.target?.kind === "comment" && unseenIds.has(event.target.commentId)
  const label = flashLabels.get(index)

  const rows = [
    Box(
      {
        flexDirection: "row",
        height: 1,
        width: "100%",
        backgroundColor: selected ? theme.surface1 : undefined,
      },
      // The left columns keep their width whatever the row says; only the
      // title gives way, so the times and types stay in a straight line.
      Box(
        { flexDirection: "row", flexShrink: 0 },
        Text({ content: label ? `${label} ` : "  ", fg: colors.flashLabel }),
        Text({ content: timeAgo(event.at).padStart(4), fg: colors.textDim }),
        Text({ content: unseen ? "  ●  " : "     ", fg: theme.blue }),
        Text({ content: TYPE_LABEL[event.type].padEnd(9), fg: typeColor(event.type) }),
        Text({ content: (event.actor ? `@${event.actor}` : "").padEnd(14), fg: theme.subtext0 })
      ),
      Box(
        { flexDirection: "row", flexGrow: 1, flexShrink: 1, overflow: "hidden" },
        Text({ content: event.title, fg: selected ? colors.text : theme.subtext1 })
      ),
      event.detail
        ? Box(
            { flexDirection: "row", flexShrink: 0 },
            Text({ content: `  ${event.detail}`, fg: colors.textDim })
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

function commitFileRows(files: readonly CommitFileSummary[] | undefined) {
  if (!files) {
    return [
      Box(
        { flexDirection: "row", height: 1 },
        Text({ content: "                   loading…", fg: colors.textDim })
      ),
    ]
  }

  return files.map((file, index) =>
    Box(
      { flexDirection: "row", height: 1 },
      Text({
        content: `                   ${index === files.length - 1 ? "└" : "├"} ${file.filename}`,
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

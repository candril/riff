import { flashLabelCell } from "../vim-diff/flash-state"
import { FEED_TYPES, type FeedEvent } from "../utils/feed"
import type { FeedRow, FeedState } from "../state"

/** Colours by name; the view maps them onto the theme. */
export type FeedTone = "text" | "dim" | "subtext0" | "subtext1" | "green" | "red" | "peach" | "mauve" | "yellow"

export interface FeedHeader {
  countText: string
  scope: string
  loadingSuffix: string
  unseenCount: number
}

export interface FeedToggle {
  key: string
  label: string
  on: boolean
}

export interface FeedLegend {
  toggles: FeedToggle[]
  filter: string
  narrowed: boolean
  /** The filter is being typed, and its field takes the legend's row. */
  filterInput: boolean
}

export interface FeedEventRow {
  kind: "event"
  key: string
  selected: boolean
  flashCell: string
  timeCell: string
  state: "unseen" | "resolved" | "none"
  typeLabel: string
  typeTone: FeedTone
  actorCell: string
  leadCell: string
  title: string
  titleTone: FeedTone
  note: string | null
  trailing: string | null
  trailingTone: FeedTone
}

/** A commit opened before its files have arrived. Not a row you can land on. */
export interface FeedLoadingRow {
  kind: "loading"
  key: string
}

export interface FeedFileRow {
  kind: "file"
  key: string
  selected: boolean
  flashCell: string
  branch: "├" | "└"
  filename: string
  additions: number
  deletions: number
}

export type FeedModelRow = FeedEventRow | FeedLoadingRow | FeedFileRow

export interface FeedModel {
  header: FeedHeader
  legend: FeedLegend
  /** Said instead of rows when the filters leave no event. */
  empty: string | null
  rows: FeedModelRow[]
}

export interface FeedModelInput {
  /** The events the filters left, newest first. */
  events: FeedEvent[]
  /** The same, as drawn: a commit's files sit under it once it is open. */
  rows: FeedRow[]
  feed: FeedState
  /** Comments that arrived since the last visit (spec 069). */
  unseenIds: ReadonlySet<string>
  /** Flash labels by row index, while `s` is labelling (spec 066). */
  flashLabels: ReadonlyMap<string, string>
  loading: boolean
  /** The clock the time gutter counts back from. */
  now: number
}

/** Column widths, in cells. The actor gets an ellipsis, never a collision. */
export const TIME_WIDTH = 4
export const TYPE_WIDTH = 9
export const ACTOR_WIDTH = 13
export const FILE_INDENT = 2 + TIME_WIDTH + 3 + TYPE_WIDTH + ACTOR_WIDTH + 2

const TYPE_TONE: Record<FeedEvent["type"], FeedTone> = {
  commit: "peach",
  comment: "mauve",
  review: "green",
  check: "yellow",
  push: "red",
  ready: "subtext0",
}

/**
 * The activity feed (spec 070) as data — one row per event, newest first:
 * what happened to this PR, and what happened since you left.
 */
export function feedModel({ events, rows, feed, unseenIds, flashLabels, loading, now }: FeedModelInput): FeedModel {
  const leadWidth = leadWidthFor(events)
  return {
    header: header(events, feed, unseenIds, loading),
    legend: legend(feed),
    empty: events.length > 0 ? null : loading ? "Reading the timeline…" : "Nothing matches — `0` shows everything",
    rows:
      events.length === 0
        ? []
        : rows.flatMap((row, index): FeedModelRow[] => {
            const selected = index === feed.highlightIndex
            const flashCell = flashLabelCell(flashLabels.get(String(index)))
            if (row.kind === "file") {
              return [
                {
                  kind: "file",
                  key: `${row.event.id}:${row.file.filename}`,
                  selected,
                  flashCell,
                  branch: row.last ? "└" : "├",
                  filename: row.file.filename,
                  additions: row.file.additions,
                  deletions: row.file.deletions,
                },
              ]
            }
            const event = row.event
            const eventRow = eventRowOf(event, previousEvent(rows, index), { selected, flashCell, feed, unseenIds, leadWidth, now })
            // Opened before its files have arrived: say so, on a line that is
            // not a row — there is nothing to land on yet.
            const waiting =
              event.target?.kind === "commit" && feed.expandedIds.has(event.id) && !feed.commitFiles.has(event.target.sha)
            return waiting ? [eventRow, { kind: "loading", key: `${event.id}:loading` }] : [eventRow]
          }),
  }
}

function header(
  events: FeedEvent[],
  feed: FeedState,
  unseenIds: ReadonlySet<string>,
  loading: boolean
): FeedHeader {
  return {
    countText: `${events.length} event${events.length === 1 ? "" : "s"}`,
    scope: feed.types.size === 0 ? "all types" : [...feed.types].join(" · "),
    loadingSuffix: loading ? " · loading" : "",
    unseenCount: events.filter((event) => isUnseen(event, unseenIds)).length,
  }
}

function legend(feed: FeedState): FeedLegend {
  return {
    toggles: [
      ...FEED_TYPES.map(({ key, type, label }) => ({ key, label, on: feed.types.has(type) })),
      { key: "u", label: "unseen", on: feed.unseenOnly },
    ],
    filter: feed.filter,
    narrowed: feed.types.size > 0 || feed.unseenOnly || feed.filter.length > 0,
    filterInput: feed.filterInput,
  }
}

const isUnseen = (event: FeedEvent, unseenIds: ReadonlySet<string>) =>
  event.target?.kind === "comment" && unseenIds.has(event.target.commentId)

function eventRowOf(
  event: FeedEvent,
  previous: FeedEvent | undefined,
  context: {
    selected: boolean
    flashCell: string
    feed: FeedState
    unseenIds: ReadonlySet<string>
    leadWidth: number
    now: number
  }
): FeedEventRow {
  const { selected, flashCell, feed, unseenIds, leadWidth, now } = context

  // The time is a gutter, not a column: it is only written where it changes,
  // so thirty rows from the same hour read as one group rather than thirty
  // repetitions of "3h".
  const time = timeAgo(event.at, now)
  const timeCell = previous && timeAgo(previous.at, now) === time ? "" : time

  // Both columns are reserved on every row and blank where there is nothing
  // to say — a check has no actor, a review no file — so the words start on
  // one straight edge whatever the row is about.
  // A commit row can open into its files, and says so in front of its sha.
  const fold = event.target?.kind === "commit" ? (feed.expandedIds.has(event.id) ? "▾ " : "▸ ") : ""
  const trailing = event.trailing ?? null

  return {
    kind: "event",
    key: event.id,
    selected,
    flashCell,
    timeCell: timeCell.padStart(TIME_WIDTH),
    state: isUnseen(event, unseenIds) ? "unseen" : event.resolved ? "resolved" : "none",
    typeLabel: event.type.padEnd(TYPE_WIDTH),
    typeTone: TYPE_TONE[event.type],
    actorCell: fitRight(actorLabel(event.actor), ACTOR_WIDTH) + "  ",
    leadCell: fitLeft(fold + (event.lead ?? ""), leadWidth) + "  ",
    title: event.title,
    // An answered comment reads as settled — dimmer, not gone.
    titleTone: selected ? "text" : event.resolved ? "dim" : "subtext1",
    note: event.note || null,
    trailing: trailing || null,
    trailingTone: trailing?.startsWith("✓") ? "green" : trailing?.startsWith("✗") ? "red" : "dim",
  }
}

/** The event above this row, for the time gutter's "only where it changes". */
export function previousEvent(rows: FeedRow[], index: number): FeedEvent | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const row = rows[i]!
    if (row.kind === "event") return row.event
  }
  return undefined
}

/** A local comment's author is stored as `@you`, so the `@` is not added twice. */
export function actorLabel(actor: string | undefined): string {
  if (!actor) return ""
  return actor.startsWith("@") ? actor : `@${actor}`
}

/** Cut from the right, with an ellipsis — for names. */
export function fitRight(text: string, width: number): string {
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
export function fitLeft(text: string, width: number): string {
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
export function leadWidthFor(events: FeedEvent[]): number {
  let widest = 0
  for (const event of events) {
    if (!event.lead) continue
    // A commit's lead carries its fold mark in front of the sha.
    const fold = event.target?.kind === "commit" ? 2 : 0
    widest = Math.max(widest, Bun.stringWidth(event.lead) + fold)
  }
  return Math.min(36, Math.max(8, widest))
}

/** Short relative time — the feed is a column of them, so they stay narrow. */
export function timeAgo(iso: string, now: number): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const minutes = Math.floor((now - then) / 60000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  return months < 12 ? `${months}mo` : `${Math.floor(days / 365)}y`
}

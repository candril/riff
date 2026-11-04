import { theme } from "../theme"
import type { PrCommit } from "../providers/github/types"
import { EMPTY_CHANGE } from "../providers/local"
import { matchSpans, type MatchSpan } from "./match-spans"
import { pickerWindow, visibleRows, type PickerModel, type PickerRow } from "./picker-window"

export interface FilteredCommit {
  commit: PrCommit
  index: number  // Original index in commits array
  /** Which of the commit's texts the query matched, and where. */
  matched?: { field: "message" | "sha" | "author"; positions: number[] }
}

/** Max items in view, "All commits" included. */
export const MAX_COMMITS_VISIBLE = 15

export const COMMIT_KEY_GROUPS = ["j/k: move", "space: mark", "V: mark a run", "/: filter", "Enter: show them"]

/** CommitPicker's panel: 60% of the screen, as Yoga rounds it, less paddingX 2 on each side. */
const keyLineWidth = (width: number) => Math.round(width * 0.6) - 4

/**
 * The groups packed into as few lines of `width` as they fit, two spaces
 * apart. A group never breaks: one wider than the line gets a line to
 * itself and the renderer cuts it.
 */
export function fitKeyLines(groups: readonly string[], width: number): string[] {
  const lines: string[] = []
  for (const group of groups) {
    const last = lines.length - 1
    if (last >= 0 && lines[last]!.length + 2 + group.length <= width) lines[last] += `  ${group}`
    else lines.push(group)
  }
  return lines
}

export interface AllCommitsRow extends PickerRow {
  kind: "all"
  /** Whether the whole diff is in view, rather than one commit's. */
  active: boolean
  labelFg: string
  total: string
}

export interface CommitRow extends PickerRow {
  kind: "commit"
  active: boolean
  /** Marked for the next scope (spec 078). */
  marked: boolean
  sha: string
  shaSpans: MatchSpan[]
  shaFg: string
  message: string
  messageSpans: MatchSpan[]
  messageFg: string
  /** EMPTY_CHANGE for a change with no files in it, else null. */
  note: string | null
  author: string
  authorSpans: MatchSpan[]
  time: string
}

export type CommitPickerRow = AllCommitsRow | CommitRow

export interface CommitPickerModel extends Omit<PickerModel<CommitPickerRow>, "count"> {
  count: null
  /** Whether `/` is open and taking what is typed into the field. */
  filtering: boolean
  /** What the field row says while not filtering: the accepted query, or how to start one. */
  fieldText: string
  fieldFg: string
  /** One entry per screen line. */
  keys: string[]
}

export interface CommitPickerInput {
  commits: readonly FilteredCommit[]
  selectedIndex: number
  viewingCommit: string | null
  marked: ReadonlySet<string>
  filtering: boolean
  query: string
  /** Whether `V` is extending a run, which changes what j/k do. */
  extending: boolean
}

export function formatTimeAgo(isoDate: string, now: Date): string {
  const date = new Date(isoDate)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString()
}

function commitRow(item: FilteredCommit, selected: boolean, input: CommitPickerInput, now: Date): CommitRow {
  const { commit } = item
  const marked = input.marked.has(commit.sha)
  const positionsIn = (field: "message" | "sha" | "author") =>
    item.matched?.field === field ? item.matched.positions : []
  const author = `@${commit.author}`
  return {
    id: `commit:${item.index}`,
    selected,
    kind: "commit",
    active: input.viewingCommit === commit.sha,
    marked,
    sha: commit.sha,
    shaSpans: matchSpans(commit.sha, positionsIn("sha")),
    shaFg: marked ? theme.peach : selected ? theme.peach : theme.yellow,
    message: commit.message,
    messageSpans: matchSpans(commit.message, positionsIn("message")),
    messageFg: marked ? theme.peach : selected ? theme.text : theme.subtext1,
    // A change with nothing in it scopes the diff to nothing, so the row
    // says so rather than letting the reader find out by picking it.
    note: commit.empty ? EMPTY_CHANGE : null,
    author,
    // The "@" is the row's, not the author's: what was matched starts after it.
    authorSpans: matchSpans(author, positionsIn("author"), -1),
    time: formatTimeAgo(commit.date, now),
  }
}

/**
 * Ctrl-g (spec 078): "All commits" first, then the commits, in a window
 * that keeps the selection in view. `width` and `height` are the
 * terminal's; `now` dates each commit.
 */
export function commitPickerModel(input: CommitPickerInput, width: number, height: number, now: Date): CommitPickerModel {
  const { commits, selectedIndex } = input
  const total = 1 + commits.length
  const keys = fitKeyLines(COMMIT_KEY_GROUPS, keyLineWidth(width))
  // The keys sit under a padding row, and every line they wrap onto is a row the list gives up.
  const footerRows = 1 + keys.length
  const { start, end, above, below } = pickerWindow(
    total,
    selectedIndex,
    visibleRows(height - footerRows, MAX_COMMITS_VISIBLE)
  )
  const rows: CommitPickerRow[] = []
  for (let i = start; i < end; i++) {
    const selected = i === selectedIndex
    rows.push(
      i === 0
        ? {
            id: "all",
            selected,
            kind: "all",
            active: input.viewingCommit === null,
            labelFg: selected ? theme.text : theme.subtext1,
            total: `${commits.length} commits`,
          }
        : commitRow(commits[i - 1]!, selected, input, now)
    )
  }
  return {
    title: input.marked.size > 0 ? `Select Commit  ${input.marked.size} marked` : "Select Commit",
    count: null,
    hints: [input.extending ? "V: stop extending" : "esc"],
    rows,
    above,
    below,
    empty: null,
    // The filter is a mode, not the way in: `/` opens it, and what it
    // found stays visible beside the list once accepted (spec 078).
    filtering: input.filtering,
    fieldText: input.query ? `/${input.query}` : "/ to filter",
    fieldFg: input.query ? theme.subtext0 : theme.overlay0,
    keys,
  }
}

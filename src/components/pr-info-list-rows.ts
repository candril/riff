import type { PrCommit } from "../providers/github"
import { theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"
import type { PreviewRow } from "../utils/previews"
import { formatTimeAgo, truncate } from "./pr-info-format"

export interface ListSegment {
  text: string
  fg: string
}

export interface ListRow {
  /** Stable across a filter or a cursor move, so a keyed reconcile restyles rows rather than rebuilding them. */
  key: string
  segments: ListSegment[]
  selected: boolean
  /** The `s` label drawn in front of the row while flash is labelling. */
  label?: string
  /** A second line under the first, the same cursor stop: an annotation's message. */
  below?: ListSegment[]
}

/** The rows of one list section, and the muted line under them: what is hidden, or that there is nothing. */
export interface ListRows {
  rows: ListRow[]
  note: string | null
}

export interface ListInput {
  /** The cursor's row, or -1 when the cursor is elsewhere. */
  selected: number
  /** The panel's flash labels, keyed `${section}:${index}`. */
  labels: ReadonlyMap<string, string>
}

const MAX_COMMITS = 20

export function row(
  section: string,
  index: number,
  key: string,
  segments: ListSegment[],
  { selected, labels }: ListInput
): ListRow {
  const label = labels.get(`${section}:${index}`)
  return { key, segments, selected: index === selected, ...(label ? { label } : {}) }
}

/**
 * One row per app: its label, then the places it is deployed by name
 * (spec 068). The URLs themselves are never drawn — that is the whole
 * point of lifting them out of the table.
 */
export function previewRows(previews: PreviewRow[], input: ListInput): ListRows {
  if (previews.length === 0) return { rows: [], note: "No preview links in this PR's conversation" }

  // Emoji are two columns wide and one character long, so the label
  // column is measured the way it is drawn.
  const width = Math.min(28, Math.max(12, ...previews.map((preview) => Bun.stringWidth(preview.app) + 2)))

  const rows = previews.map((preview, index) => {
    const selected = index === input.selected
    const segments: ListSegment[] = [
      {
        text: preview.app + " ".repeat(Math.max(1, width - Bun.stringWidth(preview.app))),
        fg: selected ? theme.text : theme.subtext1,
      },
    ]
    if (preview.links.length > 0) {
      segments.push({ text: preview.links.map((link) => link.label).join("  "), fg: theme.blue })
    } else if (preview.status) {
      segments.push({ text: preview.status, fg: theme.overlay0 })
    }
    if (preview.built) segments.push({ text: `  ${preview.built.label}`, fg: theme.overlay0 })
    return row("previews", index, `${index}:${preview.app}`, segments, input)
  })
  return { rows, note: null }
}

/**
 * One column for the names, so the counts after them line up: as wide as
 * the longest name, and no wider than the room the counts leave.
 */
export function fileRows(files: DiffFile[], input: ListInput & { listWidth: number }): ListRows {
  if (files.length === 0) return { rows: [], note: "No files changed" }

  const nameWidth = Math.min(input.listWidth - 12, Math.max(...files.map((file) => Bun.stringWidth(file.filename))))

  const rows = files.map((file, index) => {
    const name = truncate(file.filename, nameWidth)
    const segments: ListSegment[] = [
      {
        text: name + " ".repeat(Math.max(0, nameWidth - Bun.stringWidth(name))),
        fg: index === input.selected ? theme.text : theme.subtext1,
      },
      { text: `+${file.additions}`.padStart(6), fg: theme.green },
      { text: `-${file.deletions}`.padStart(6), fg: theme.red },
    ]
    return row("files", index, file.filename, segments, input)
  })
  return { rows, note: null }
}

/** How many commit rows `commitRows` draws, which is how far the cursor may go. */
export function commitRowCount(commits: PrCommit[]): number {
  return Math.min(commits.length, MAX_COMMITS)
}

/**
 * The newest twenty commits; the rest are only counted. The message gets
 * what the time and sha columns leave of the terminal's width.
 */
export function commitRows(
  commits: PrCommit[],
  input: ListInput & { terminalWidth: number; now?: number }
): ListRows {
  if (commits.length === 0) return { rows: [], note: "No commits" }

  const messageWidth = Math.max(20, input.terminalWidth - 20)
  const rows = commits.slice(0, MAX_COMMITS).map((commit, index) => {
    const selected = index === input.selected
    const segments: ListSegment[] = [
      { text: formatTimeAgo(commit.date, input.now).padEnd(8), fg: theme.subtext0 },
      { text: `${commit.sha.slice(0, 7)} `, fg: selected ? theme.peach : theme.yellow },
      { text: truncate(commit.message, messageWidth), fg: selected ? theme.text : theme.subtext1 },
    ]
    return row("commits", index, commit.sha, segments, input)
  })
  const more = commits.length - MAX_COMMITS
  return { rows, note: more > 0 ? `... +${more} more` : null }
}

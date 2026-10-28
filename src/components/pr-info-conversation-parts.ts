import { theme } from "../theme"
import { REACTION_META, type ReactionSummary } from "../types"
import type { DiffFile } from "../utils/diff-parser"

export interface Segment {
  text: string
  fg: string
}

/** Room for a comment's one-line preview once its row's icon, author, time and padding are placed. */
export function bodyPreviewWidth(panelWidth: number): number {
  return Math.max(20, panelWidth - 44)
}

/** As bodyPreviewWidth, less the file:line column and reply count a thread row also carries. */
export function threadBodyPreviewWidth(panelWidth: number): number {
  return Math.max(15, panelWidth - 63)
}

/** A wider panel gives the file name more room, within bounds. */
export function threadFileLineWidth(panelWidth: number): number {
  return Math.min(40, Math.max(20, Math.floor(panelWidth * 0.25)))
}

/**
 * Reactions as one compact line like "👍2 ❤️1", or "" when there are none.
 * A collapsed row has one line, which a pill list would blow out (spec 042).
 */
export function inlineReactions(reactions: ReactionSummary[] | undefined): string {
  const visible = (reactions ?? []).filter((r) => r.count > 0)
  return visible.map((r) => `${REACTION_META[r.content].emoji}${r.count}`).join(" ")
}

/**
 * One pill per reaction anyone has left, or that the viewer left even when
 * the count says otherwise. The viewer's own read blue: as text, not a
 * background, so the emoji does not sit inside a colour block.
 */
export function reactionPills(reactions: ReactionSummary[] | undefined): Segment[] {
  return (reactions ?? [])
    .filter((r) => r.count > 0 || r.viewerHasReacted)
    .map((r) => ({
      text: `${REACTION_META[r.content].emoji} ${r.count}`,
      fg: r.viewerHasReacted ? theme.blue : theme.subtext1,
    }))
}

/**
 * The loaded diff around `line`, from the nearest hunk header above it,
 * for a thread GitHub sent without a hunk of its own.
 */
export function fileDiffContext(files: DiffFile[], filename: string, line: number): string | null {
  const file = files.find((f) => f.filename === filename)
  if (!file?.content) return null

  const lines = file.content.split("\n")
  const contextRadius = 4
  const start = Math.max(0, line - contextRadius - 1)
  const end = Math.min(lines.length, line + contextRadius)

  let hunkStart = start
  for (let i = start; i >= 0; i--) {
    if (lines[i]?.startsWith("@@")) {
      hunkStart = i
      break
    }
  }

  const contextLines = lines.slice(hunkStart, end)
  if (contextLines.length === 0) return null
  return contextLines.join("\n")
}

const HUNK_LINES = 8

/** The last lines of a hunk, nearest the commented line, coloured as a diff. */
export function hunkLines(diffHunk: string): Segment[] {
  const visible = diffHunk.split("\n").slice(-HUNK_LINES)
  // A trailing newline leaves an empty last line, dropped only when no
  // earlier line is empty too.
  const firstEmpty = visible.indexOf("")
  return visible
    .filter((line, i) => !(line === "" && firstEmpty === visible.length - 1 && i === firstEmpty))
    .map((line) => ({ text: line || " ", fg: hunkColour(line) }))
}

function hunkColour(line: string): string {
  if (line.startsWith("+")) return theme.green
  if (line.startsWith("-")) return theme.red
  if (line.startsWith("@@")) return theme.blue
  return theme.overlay1
}

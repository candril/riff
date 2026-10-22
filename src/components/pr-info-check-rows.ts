import type { PrCheck, PrCheckAnnotation } from "../providers/github/types"
import { theme } from "../theme"
import type { Comment } from "../types"
import { pointStyle, type MergePoint } from "./merge-status-model"
import { cleanBodyPreview, getCheckStatusDisplay, truncate } from "./pr-info-format"
import { isFailingCheck, POINT_LABELS, type FlatCheckItem } from "./pr-info-items"
import { row, type ListInput, type ListRow, type ListRows, type ListSegment } from "./pr-info-list-rows"

// Under a line: two columns in from the gates' icons, under their labels.
const CHECK_INDENT = "  "

const PLACEHOLDERS = {
  loading: `${CHECK_INDENT}  Loading annotations…`,
  empty: `${CHECK_INDENT}  No annotations — press o to open log`,
  error: `${CHECK_INDENT}  Could not fetch annotations`,
} as const

// The columns of the terminal a merge status row cannot use: the panel's
// indent in front of it and its margin after it.
const ROW_MARGIN = 7

const LABEL_WIDTH = Math.max(...Object.values(POINT_LABELS).map((label) => label.length))

/**
 * One row per gate of the merge status, under an open checks line each
 * check, then under an expanded failing one its annotations, or a row
 * saying why there are none, and under an open conversations line each
 * unresolved thread (specs 043, 108). Nothing at all when the filter
 * hides every row.
 */
export function checkRows(
  items: FlatCheckItem[],
  input: ListInput & {
    expanded: ReadonlySet<number>
    expandable: (point: MergePoint) => boolean
    terminalWidth: number
  }
): ListRows {
  const keys = new Map<string, number>()
  const rows = items.map((item, index): ListRow => {
    const selected = index === input.selected
    switch (item.kind) {
      case "point": {
        // Several blockers can stand at once, each a line of its own; only
        // the first is labelled.
        const seen = keys.get(item.point.id) ?? 0
        keys.set(item.point.id, seen + 1)
        const key = seen === 0 ? `point:${item.point.id}` : `point:${item.point.id}:${seen}`
        const next = items[index + 1]
        const open = next !== undefined && next.kind !== "point"
        const fold = input.expandable(item.point) ? (open ? "▼" : "▶") : null
        return row("checks", index, key, pointSegments(item.point, { selected, labelled: seen === 0, fold }), input)
      }
      case "check":
        return row("checks", index, `check:${item.check.id}`, checkSegments(item.check, selected, input.expanded), input)
      case "annotation": {
        const at = item.check.annotations?.indexOf(item.annotation) ?? -1
        const message = (item.annotation.message || "").split("\n")[0] ?? ""
        return {
          ...row("checks", index, `annotation:${item.check.id}:${at}`, annotationSegments(item.annotation, selected), input),
          below: [{ text: message ? `${CHECK_INDENT}      ${message}` : "", fg: theme.overlay0 }],
        }
      }
      case "placeholder":
        return row(
          "checks",
          index,
          `placeholder:${item.check.id}`,
          [{ text: PLACEHOLDERS[item.placeholder], fg: theme.overlay0 }],
          input
        )
      case "thread":
        return row("checks", index, `thread:${item.thread.id}`, threadSegments(item.thread, selected, input.terminalWidth), input)
    }
  })
  return { rows, note: null }
}

function pointSegments(
  point: MergePoint,
  { selected, labelled, fold }: { selected: boolean; labelled: boolean; fold: "▶" | "▼" | null }
): ListSegment[] {
  const { icon, fg } = pointStyle(point.state)
  const label = labelled ? POINT_LABELS[point.id] : ""
  // An idle line is there to be passed over: nothing about it asks for a move.
  const idle = point.state === "idle"
  const segments: ListSegment[] = [
    { text: `${icon} `, fg },
    { text: `${label.padEnd(LABEL_WIDTH)}  `, fg: idle ? fg : theme.subtext0 },
    { text: point.text, fg: idle ? fg : selected ? theme.text : theme.subtext1 },
  ]
  if (fold) segments.push({ text: `  ${fold}`, fg: theme.overlay0 })
  return segments
}

function checkSegments(check: PrCheck, selected: boolean, expanded: ReadonlySet<number>): ListSegment[] {
  const { icon, color } = getCheckStatusDisplay(check)
  const segments: ListSegment[] = [
    { text: `${CHECK_INDENT}${icon} `, fg: color },
    { text: check.name, fg: selected ? theme.text : theme.subtext1 },
  ]
  if (check.status !== "completed") {
    segments.push({ text: ` (${check.status})`, fg: theme.overlay0 })
  } else if (check.conclusion && check.conclusion !== "success") {
    segments.push({ text: ` (${check.conclusion})`, fg: theme.overlay0 })
  }
  if (isFailingCheck(check)) {
    const count = check.annotations?.length ?? 0
    const suffix = count > 0 ? ` [${count}]` : ""
    segments.push({ text: `  ${expanded.has(check.id) ? "▼" : "▶"}${suffix}`, fg: theme.overlay0 })
  }
  return segments
}

function threadSegments(thread: Comment, selected: boolean, terminalWidth: number): ListSegment[] {
  const file = thread.filename.split("/").pop() || thread.filename
  // A file-level comment comes back from GitHub with no line at all.
  const location = thread.line > 0 ? `${file}:${thread.line}` : `${file} (file)`
  const segments: ListSegment[] = [
    { text: `${CHECK_INDENT}⚠ `, fg: theme.yellow },
    { text: location, fg: theme.yellow },
    { text: `  @${thread.author ?? "you"}`, fg: selected ? theme.blue : theme.sapphire },
  ]
  // A text too wide for its row squeezes the segments before it rather than
  // being cut, so the preview is cut here to what is left of the row.
  const used = segments.reduce((width, segment) => width + Bun.stringWidth(segment.text), 0)
  const preview = truncate(cleanBodyPreview(thread.body), Math.max(1, terminalWidth - ROW_MARGIN - used - 2))
  segments.push({ text: `  ${preview}`, fg: selected ? theme.text : theme.subtext1 })
  return segments
}

function annotationSegments(annotation: PrCheckAnnotation, selected: boolean): ListSegment[] {
  const bullet =
    annotation.level === "failure" ? theme.red : annotation.level === "warning" ? theme.yellow : theme.subtext0
  return [
    { text: `${CHECK_INDENT}  `, fg: theme.overlay0 },
    { text: "• ", fg: bullet },
    { text: annotationLocation(annotation), fg: selected ? theme.text : theme.subtext1 },
  ]
}

/** GitHub marks a file-level annotation with start line 0, which is no place to go to. */
function annotationLocation({ path, startLine, startColumn }: PrCheckAnnotation): string {
  if (startLine <= 0) return path
  return startColumn !== undefined ? `${path}:${startLine}:${startColumn}` : `${path}:${startLine}`
}

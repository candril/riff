import type { PrCheck, PrCheckAnnotation } from "../providers/github/types"
import { theme } from "../theme"
import { pointStyle, type MergePoint } from "./merge-status-model"
import { getCheckStatusDisplay } from "./pr-info-format"
import { isFailingCheck, POINT_LABELS, type FlatCheckItem } from "./pr-info-items"
import { row, type ListInput, type ListRow, type ListRows, type ListSegment } from "./pr-info-list-rows"

// Under the checks line: two columns in from the gates' icons, under their labels.
const CHECK_INDENT = "  "

const PLACEHOLDERS = {
  loading: `${CHECK_INDENT}  Loading annotations…`,
  empty: `${CHECK_INDENT}  No annotations — press o to open log`,
  error: `${CHECK_INDENT}  Could not fetch annotations`,
} as const

const LABEL_WIDTH = Math.max(...Object.values(POINT_LABELS).map((label) => label.length))

/**
 * One row per gate of the merge status, and under an open checks line each
 * check, then under an expanded failing one its annotations, or a row
 * saying why there are none (specs 043, 108). Nothing at all when the filter
 * hides every row.
 */
export function checkRows(
  items: FlatCheckItem[],
  input: ListInput & { expanded: ReadonlySet<number>; expandable: (point: MergePoint) => boolean }
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
        const fold = input.expandable(item.point) ? (items[index + 1]?.kind === "check" ? "▼" : "▶") : null
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
  const segments: ListSegment[] = [
    { text: `${icon} `, fg },
    { text: `${label.padEnd(LABEL_WIDTH)}  `, fg: theme.subtext0 },
    { text: point.text, fg: selected ? theme.text : theme.subtext1 },
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

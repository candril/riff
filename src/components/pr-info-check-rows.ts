import type { PrCheck, PrCheckAnnotation } from "../providers/github/types"
import { theme } from "../theme"
import { getCheckStatusDisplay } from "./pr-info-format"
import { isFailingCheck, type FlatCheckItem } from "./pr-info-items"
import { row, type ListInput, type ListRow, type ListRows, type ListSegment } from "./pr-info-list-rows"

const PLACEHOLDERS = {
  loading: "  Loading annotations…",
  empty: "  No annotations — press o to open log",
  error: "  Could not fetch annotations",
} as const

/**
 * Each check, and under an expanded failing one its annotations, or a row
 * saying why there are none (spec 043). Nothing at all when the filter
 * hides every check: only a PR with none is said to have none.
 */
export function checkRows(
  items: FlatCheckItem[],
  input: ListInput & { expanded: ReadonlySet<number>; hasChecks: boolean }
): ListRows {
  if (!input.hasChecks) return { rows: [], note: "No checks configured" }

  const rows = items.map((item, index): ListRow => {
    const selected = index === input.selected
    switch (item.kind) {
      case "check":
        return row("checks", index, `check:${item.check.id}`, checkSegments(item.check, selected, input.expanded), input)
      case "annotation": {
        const at = item.check.annotations?.indexOf(item.annotation) ?? -1
        const message = (item.annotation.message || "").split("\n")[0] ?? ""
        return {
          ...row("checks", index, `annotation:${item.check.id}:${at}`, annotationSegments(item.annotation, selected), input),
          below: [{ text: message ? `      ${message}` : "", fg: theme.overlay0 }],
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

function checkSegments(check: PrCheck, selected: boolean, expanded: ReadonlySet<number>): ListSegment[] {
  const { icon, color } = getCheckStatusDisplay(check)
  const segments: ListSegment[] = [
    { text: `${icon} `, fg: color },
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
    { text: "  ", fg: theme.overlay0 },
    { text: "• ", fg: bullet },
    { text: annotationLocation(annotation), fg: selected ? theme.text : theme.subtext1 },
  ]
}

/** GitHub marks a file-level annotation with start line 0, which is no place to go to. */
function annotationLocation({ path, startLine, startColumn }: PrCheckAnnotation): string {
  if (startLine <= 0) return path
  return startColumn !== undefined ? `${path}:${startLine}:${startColumn}` : `${path}:${startLine}`
}

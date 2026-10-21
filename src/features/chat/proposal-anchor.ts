import type { ExcerptLine } from "../../providers/agent/position"
import { hunksOf } from "../../providers/agent/hunks"
import type { DiffFile } from "../../utils/diff-parser"

export interface ProposalPlace {
  path: string
  line: number
  startLine?: number
  side: "new" | "old"
}

export interface ProposalAnchor {
  filename: string
  line: number
  startLine?: number
  side: "LEFT" | "RIGHT"
}

const DIFF_ONLY = "comments go on lines the diff shows."

// The sides the agent's schema names: GitHub files a comment on a removed line on the left, every
// other line on the right, which is where riff's own `c` puts it too.
function numberOn(line: ExcerptLine, side: ProposalPlace["side"]): number | undefined {
  if (side === "old") return line.kind === "removed" ? line.oldLine : undefined
  return line.kind === "removed" ? undefined : line.newLine
}

function hunkIndexOf(file: DiffFile, line: number, side: ProposalPlace["side"]): number {
  return hunksOf(file).findIndex((hunk) => hunk.lines.some((l) => numberOn(l, side) === line))
}

function unchangedLine(file: DiffFile, oldLine: number): ExcerptLine | undefined {
  return hunksOf(file)
    .flatMap((hunk) => hunk.lines)
    .find((l) => l.kind === "context" && l.oldLine === oldLine)
}

/** Where the agent's comment opens, or why it cannot: the tool returns that reason as it is. */
export function proposalAnchor(
  files: readonly DiffFile[],
  hidden: ReadonlySet<string>,
  place: ProposalPlace,
): ProposalAnchor | string {
  const { path, line, startLine, side } = place
  const file = files.find((f) => f.filename === path)
  if (!file) return `${path} is not a changed file; ${DIFF_ONLY}`
  // The reviewer cannot see a hidden file, so a composer opened on it would be out of sight.
  if (hidden.has(path)) return `${path} is hidden by the reviewer's ignore patterns; comments go on files they see.`

  const hunk = hunkIndexOf(file, line, side)
  if (hunk < 0) {
    const unchanged = side === "old" ? unchangedLine(file, line) : undefined
    return unchanged
      ? `${path}:${line} on the old side is an unchanged line; it takes a comment as ${path}:${unchanged.newLine} on the new side.`
      : `${path}:${line} on the ${side} side is not a line of the diff; ${DIFF_ONLY}`
  }
  if (startLine !== undefined) {
    if (startLine >= line) return `startLine ${startLine} must be below line ${line}.`
    if (hunkIndexOf(file, startLine, side) !== hunk) {
      return `${path}:${startLine}-${line} on the ${side} side is not one hunk's lines; a range stays inside one hunk.`
    }
  }
  return {
    filename: path,
    line,
    ...(startLine !== undefined ? { startLine } : {}),
    side: side === "old" ? "LEFT" : "RIGHT",
  }
}

/** How the chat and the agent name the place: as list_comments does. */
export function anchorPlace(anchor: ProposalAnchor): string {
  const lines = anchor.startLine ? `${anchor.startLine}-${anchor.line}` : String(anchor.line)
  return `${anchor.filename}:${lines}${anchor.side === "LEFT" ? " (old)" : ""}`
}

/**
 * Fenced code blocks in a diff (spec 058).
 *
 * A block is read one side at a time. The rows between ``` and ``` are a mix
 * of context, additions and deletions; the version that will exist after the
 * change is the context and the additions, the version being replaced is the
 * context and the deletions, and only one of those two is ever a diagram
 * anybody wants to look at at a time.
 */

const FENCE = /^(```|~~~)\s*(\S*)/

export type DiffSide = "new" | "old"

export interface FencedLine {
  type: string
  content: string
  filename?: string
}

export interface FencedBlock {
  /** The opening and closing fence rows, by index into the lines. */
  start: number
  end: number
  /** The word after the opening fence: `mermaid`, `ts`, or nothing. */
  info: string
}

/** Whether a row exists in the given version of the file. */
export function onSide(line: FencedLine, side: DiffSide): boolean {
  if (line.type === "addition") return side === "new"
  if (line.type === "deletion") return side === "old"
  return line.type === "context"
}

/** The side a row is written on — what `Tab` in the peek starts from. */
export function sideOf(line: FencedLine | undefined): DiffSide {
  return line?.type === "deletion" ? "old" : "new"
}

/**
 * The fenced block a row falls inside, read on one side of the diff.
 *
 * Returns nothing when the row is outside every block, when it is a fence
 * itself, or when the block never closes — an unterminated fence is more
 * likely a hunk that starts mid-block than a block that runs to the end.
 */
export function findFencedBlock(
  lines: readonly FencedLine[],
  index: number,
  side: DiffSide,
): FencedBlock | null {
  const file = lines[index]?.filename
  let open: FencedBlock | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.filename !== file || !onSide(line, side)) continue

    const fence = line.content.trim().match(FENCE)
    if (!fence) continue

    if (!open) {
      open = { start: i, end: -1, info: fence[2] ?? "" }
      continue
    }

    open.end = i
    if (index > open.start && index < open.end) return open
    open = null
  }

  return null
}

/** The rows inside a block that exist on the given side. */
export function blockContent(
  lines: readonly FencedLine[],
  block: FencedBlock,
  side: DiffSide,
): number[] {
  const rows: number[] = []
  for (let i = block.start + 1; i < block.end; i++) {
    if (onSide(lines[i]!, side)) rows.push(i)
  }
  return rows
}

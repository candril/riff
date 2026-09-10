/**
 * Fenced code blocks in a diff (specs 058, 073).
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

/**
 * A block as a fold (spec 073). Where `findFencedBlock` reads one block on
 * one side of the diff — the peek's question — this lists every block in
 * the rows as drawn, which is what folding needs: the fold hides rows,
 * whichever side they are on.
 */
export interface FoldableBlock {
  /** Stable across rebuilds: the file, the side, and the fence's line. */
  id: string
  filename: string
  /** Row of the opening fence, and of the closing one. */
  start: number
  end: number
  info: string
  /** Rows between the fences. */
  size: number
}

export interface FoldableLine extends FencedLine {
  sourceContent?: string
  oldLineNum?: number
  newLineNum?: number
}

/**
 * Every fenced block in the rows as they stand.
 *
 * A block is only a block when both of its fences are there: a fence whose
 * partner is outside the hunk is a run of text riff has no business folding
 * away. Nor does one reach across a file boundary.
 */
export function findFoldableBlocks(lines: readonly FoldableLine[]): FoldableBlock[] {
  const blocks: FoldableBlock[] = []
  let open: { row: number; marker: string; info: string } | null = null

  for (let row = 0; row < lines.length; row++) {
    const line = lines[row]!
    if (line.type === "file-header" || line.type === "spacing") {
      open = null
      continue
    }
    if (!isContent(line.type)) continue

    const fence = (line.sourceContent ?? line.content).trim().match(FENCE)
    if (!fence) continue
    const marker = fence[1]![0]!
    const info = (fence[2] ?? "").trim()

    if (!open) {
      open = { row, marker, info }
      continue
    }
    // A closing fence is the same character and carries no info string.
    if (marker !== open.marker || info.length > 0) continue

    blocks.push({
      id: blockId(lines[open.row]!, open.row),
      filename: line.filename ?? "",
      start: open.row,
      end: row,
      info: open.info,
      size: row - open.row - 1,
    })
    open = null
  }

  return blocks
}

/** The block a row is in — its fences included — or null. */
export function blockAt(blocks: readonly FoldableBlock[], row: number): FoldableBlock | null {
  return blocks.find((block) => row >= block.start && row <= block.end) ?? null
}

/**
 * A block's identity, which has to survive a rebuilt mapping: a rebuild
 * renumbers every row, but not the file's own line numbers.
 */
function blockId(fence: FoldableLine, row: number): string {
  const side = fence.type === "deletion" ? "LEFT" : "RIGHT"
  const lineNum = side === "LEFT" ? fence.oldLineNum : fence.newLineNum
  return `${fence.filename ?? ""}:${side}:${lineNum ?? `row${row}`}`
}

function isContent(type: string): boolean {
  return type === "context" || type === "addition" || type === "deletion"
}

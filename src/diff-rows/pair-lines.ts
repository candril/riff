import type { DiffLine } from "../vim-diff/types"

export interface LinePair {
  left?: number
  right?: number
}

/**
 * Visual indices into `lines`. A run of removed lines pairs in order with the
 * run of added lines right after it; the longer run's extra lines face
 * nothing. A "\ No newline" marker joins the run it follows, so it stays on
 * the side it describes and never breaks a removal off from its additions.
 */
export function pairLines(lines: readonly DiffLine[]): Array<LinePair | { full: number }> {
  const rows: Array<LinePair | { full: number }> = []
  const runOf = (type: "deletion" | "addition", start: number): number[] => {
    const run: number[] = []
    let i = start
    while (lines[i]?.type === type) {
      run.push(i++)
      if (lines[i]?.type === "no-newline") run.push(i++)
    }
    return run
  }

  let i = 0
  while (i < lines.length) {
    const type = lines[i]!.type
    if (type === "context") {
      rows.push(lines[i]!.rendered ? { right: i } : { left: i, right: i })
      i++
    } else if (type === "deletion" || type === "addition") {
      const removed = runOf("deletion", i)
      const added = runOf("addition", i + removed.length)
      i += removed.length + added.length
      for (let k = 0; k < Math.max(removed.length, added.length); k++) {
        const pair: LinePair = {}
        if (removed[k] !== undefined) pair.left = removed[k]
        if (added[k] !== undefined) pair.right = added[k]
        rows.push(pair)
      }
    } else {
      rows.push({ full: i++ })
    }
  }
  return rows
}

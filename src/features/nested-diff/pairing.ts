/**
 * A document turning into its diff in one review (spec 116): `X` deleted,
 * `X.diff` added. Every line gained a marker, so git sees no rename, and
 * the deletion shows the whole file in red. Drawn against the inner new
 * side of `X.diff`, it shows what the conversion changed.
 */

import type { DiffFile } from "../../utils/diff-parser"
import type { DiffLine } from "../../vim-diff/types"
import { innerFilename, isNestedDiffFile, stripInner } from "./nest"

export interface PairedFile {
  /** The added `X.diff`. */
  nested: string
  /** What the inner diff calls its new side, `+++ contract`, if it names it. */
  label: string | undefined
  rows: readonly PairedRow[]
}

export type PairedRow =
  | { type: "context"; content: string; oldLineNum: number; newLineNum: number }
  | { type: "deletion"; content: string; oldLineNum: number }
  | { type: "addition"; content: string; newLineNum: number }

/** Each deleted file with an added `X.diff` or `X.patch` beside it, to that file. */
export function findPairs(files: readonly DiffFile[]): Map<string, DiffFile> {
  const deleted = new Map(files.filter((file) => file.status === "deleted").map((file) => [file.filename, file]))
  const pairs = new Map<string, DiffFile>()
  for (const file of files) {
    if (file.status !== "added" || !isNestedDiffFile(file.filename)) continue
    const original = innerFilename(file.filename)
    if (deleted.has(original) && !pairs.has(original)) pairs.set(original, file)
  }
  return pairs
}

/** The one side of a whole-file diff, numbered from 1; null when the diff is not of the whole file. */
function wholeSide(diff: string, marker: "+" | "-"): string[] | null {
  const lines: string[] = []
  let inHunk = false
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("@@")) {
      // A whole file is one hunk from line 1; anything else is a part.
      if (inHunk || !/^@@ -(0,0|1(,\d+)?) \+(0,0|1(,\d+)?) @@/.test(raw)) return null
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (raw.startsWith(marker)) lines.push(raw.slice(1))
    else if (raw.startsWith("\\")) continue
    else if (raw !== "") return null
  }
  return inHunk ? lines : null
}

/** The inner new side of a nested file's text: each line's text and its line in the file. */
function innerNewSide(lines: readonly string[]): { label: string | undefined; side: { text: string; line: number }[] } {
  const side: { text: string; line: number }[] = []
  let label: string | undefined
  lines.forEach((content, at) => {
    if (content.startsWith("--- ") && lines[at + 1]?.startsWith("+++ ")) return
    if (content.startsWith("+++ ") && lines[at - 1]?.startsWith("--- ")) {
      label ??= content
      return
    }
    if (content === "" || content.startsWith(" ")) side.push({ text: stripInner(content, "context"), line: at + 1 })
    else if (content.startsWith("+")) side.push({ text: stripInner(content, "addition"), line: at + 1 })
  })
  return { label, side }
}

// Past this the table is not worth its memory: a document is a few hundred lines.
const MAX_CELLS = 4_000_000

/**
 * The rows of `X` against the inner new side, as a diff orders them: in each
 * changed stretch the removals, then the additions. Null where either text
 * is not whole in its diff (GitHub leaves a huge file's patch out) or the
 * two are too long to compare.
 */
export function pairedRows(original: DiffFile, nested: DiffFile): PairedFile | null {
  const known = compared.get(original)
  if (known?.nested === nested) return known.paired
  const paired = compare(original, nested)
  compared.set(original, { nested, paired })
  return paired
}

// The mapping is rebuilt on every fold and expansion; the review's files are the same objects until it reloads.
const compared = new WeakMap<DiffFile, { nested: DiffFile; paired: PairedFile | null }>()

function compare(original: DiffFile, nested: DiffFile): PairedFile | null {
  const old = wholeSide(original.content, "-")
  const nestedLines = wholeSide(nested.content, "+")
  if (!old || !nestedLines) return null
  const { label, side } = innerNewSide(nestedLines)
  const ops = lineDiff(old, side.map((line) => line.text))
  if (!ops) return null

  const rows: PairedRow[] = ops.map((op) => {
    if (op.kind === "equal") {
      return { type: "context", content: old[op.old]!, oldLineNum: op.old + 1, newLineNum: side[op.new]!.line }
    }
    if (op.kind === "delete") return { type: "deletion", content: old[op.old]!, oldLineNum: op.old + 1 }
    return { type: "addition", content: side[op.new]!.text, newLineNum: side[op.new]!.line }
  })
  return { nested: nested.filename, label: label?.slice(4).trim() || undefined, rows }
}

type Op = { kind: "equal"; old: number; new: number } | { kind: "delete"; old: number } | { kind: "insert"; new: number }

/** A longest-common-subsequence line diff, its common head and tail trimmed first. */
export function lineDiff(a: readonly string[], b: readonly string[]): Op[] | null {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++

  const n = a.length - head - tail
  const m = b.length - head - tail
  if ((n + 1) * (m + 1) > MAX_CELLS) return null

  // lengths[i][j]: the LCS of a's middle from i and b's middle from j.
  const width = m + 1
  const lengths = new Int32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lengths[i * width + j] =
        a[head + i] === b[head + j]
          ? lengths[(i + 1) * width + j + 1]! + 1
          : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!)
    }
  }

  const ops: Op[] = []
  for (let k = 0; k < head; k++) ops.push({ kind: "equal", old: k, new: k })
  let i = 0
  let j = 0
  const deletes: Op[] = []
  const inserts: Op[] = []
  const flush = () => {
    ops.push(...deletes, ...inserts)
    deletes.length = 0
    inserts.length = 0
  }
  while (i < n || j < m) {
    if (i < n && j < m && a[head + i] === b[head + j]) {
      flush()
      ops.push({ kind: "equal", old: head + i++, new: head + j++ })
    } else if (j >= m || (i < n && lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!)) {
      deletes.push({ kind: "delete", old: head + i++ })
    } else {
      inserts.push({ kind: "insert", new: head + j++ })
    }
  }
  flush()
  for (let k = 0; k < tail; k++) ops.push({ kind: "equal", old: a.length - tail + k, new: b.length - tail + k })
  return ops
}

/** A paired file's rows as the mapping's lines, each anchored to the file it came from. */
export function pairedLines(paired: PairedFile, fileIndex: number, filename: string): DiffLine[] {
  return paired.rows.map((row, visualIndex) => {
    const base = { visualIndex, content: row.content, fileIndex, filename }
    if (row.type === "deletion") {
      return { ...base, type: "deletion", rawLine: `-${row.content}`, oldLineNum: row.oldLineNum }
    }
    const right = { newLineNum: row.newLineNum, pairedFile: paired.nested }
    if (row.type === "addition") return { ...base, type: "addition", rawLine: `+${row.content}`, ...right }
    return { ...base, type: "context", rawLine: ` ${row.content}`, oldLineNum: row.oldLineNum, ...right }
  })
}

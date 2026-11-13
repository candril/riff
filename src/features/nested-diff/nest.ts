/**
 * A file that is a diff, read as the diff it contains (spec 116). Pure: the
 * mapping hands its lines in and draws what comes back.
 */

import type { DiffFile } from "../../utils/diff-parser"
import type { DiffLine, InnerLineType } from "../../vim-diff/types"

const NESTED_FILE = /\.(diff|patch)$/i

export function isNestedDiffFile(filename: string): boolean {
  return NESTED_FILE.test(filename)
}

/** The file the inner diff is of, by name: `X.md.diff` is a diff of `X.md`. */
export function innerFilename(filename: string): string {
  return filename.replace(NESTED_FILE, "")
}

type InnerSide = "old" | "new"

/**
 * One line's inner type. `--- ` and `+++ ` lines are a header only as a pair,
 * the `+++ ` straight after the `--- ` on the same outer side: alone, `--- x`
 * is the removal of `-- x`, a SQL comment or a markdown rule's neighbour.
 */
function innerTypeOf(content: string, next: string | undefined, previous: string | undefined): InnerLineType {
  if (content.startsWith("--- ") && next?.startsWith("+++ ")) return "old-header"
  if (content.startsWith("+++ ") && previous?.startsWith("--- ")) return "new-header"
  // An editor that strips trailing whitespace leaves inner context as an empty line.
  if (content === "" || content.startsWith(" ")) return "context"
  if (content.startsWith("+")) return "addition"
  if (content.startsWith("-")) return "deletion"
  return "meta"
}

const isContent = (line: DiffLine) => line.type === "context" || line.type === "addition" || line.type === "deletion"

const onOuterSide = (line: DiffLine, side: InnerSide) =>
  line.type === "context" || line.type === (side === "new" ? "addition" : "deletion")

/** The inner types of a file's content lines, by index into `lines`. */
export function classifyInner(lines: readonly DiffLine[], indices: readonly number[]): Map<number, InnerLineType> {
  const types = new Map<number, InnerLineType>()
  // A header pair sits on one version of the outer file: walk each version's lines in order.
  for (const side of ["old", "new"] as const) {
    const own = indices.filter((index) => onOuterSide(lines[index]!, side))
    own.forEach((index, at) => {
      const content = lines[index]!.content
      const type = innerTypeOf(content, lines[own[at + 1]!]?.content, lines[own[at - 1]!]?.content)
      // A context line is on both versions; it is drawn as the new one reads it.
      if (!types.has(index) || side === "new") types.set(index, type)
    })
  }
  return types
}

const STRIPPED: ReadonlySet<InnerLineType> = new Set(["context", "addition", "deletion"])

/** The line's text without its inner marker; header and meta lines keep theirs. */
export function stripInner(content: string, type: InnerLineType): string {
  return STRIPPED.has(type) ? content.slice(1) : content
}

/**
 * Rewrite each content line of a nested file in place: `content` loses the
 * inner marker, `sourceContent` keeps the file's line, and the line says
 * what it is inside. Rows, types and numbers stay the outer diff's.
 */
export function nestLines(
  lines: readonly DiffLine[],
  files: readonly DiffFile[],
  nested: (filename: string) => boolean,
): DiffLine[] {
  const byFile = new Map<string, number[]>()
  lines.forEach((line, index) => {
    if (!line.filename || !isContent(line) || line.rendered || line.pairedFile) return
    if (!nested(line.filename)) return
    const indices = byFile.get(line.filename) ?? []
    indices.push(index)
    byFile.set(line.filename, indices)
  })
  if (byFile.size === 0) return lines.map(markHeader)

  const out = lines.map(markHeader)
  for (const [filename, indices] of byFile) {
    // An added or a deleted file's every line would carry the same mark.
    const status = files.find((file) => file.filename === filename)?.status
    const showOuter = status === "modified" || status === "renamed"
    const types = classifyInner(lines, indices)
    for (const index of indices) {
      const line = lines[index]!
      const inner = types.get(index)!
      out[index] = {
        ...line,
        content: stripInner(line.content, inner),
        sourceContent: line.content,
        inner,
        ...(showOuter && (line.type === "addition" || line.type === "deletion") ? { outerChange: line.type } : {}),
      }
    }
  }
  return out

  function markHeader(line: DiffLine): DiffLine {
    if (line.type !== "file-header" || !line.filename || line.rendered || line.pairedFile) return line
    return nested(line.filename) ? { ...line, nested: true } : line
  }
}

/** Where a line lives in the inner diff: its old side, its new side, or both. */
export function innerSideOf(inner: InnerLineType): InnerSide | "both" | null {
  if (inner === "addition" || inner === "new-header") return "new"
  if (inner === "deletion" || inner === "old-header") return "old"
  if (inner === "context") return "both"
  return null
}

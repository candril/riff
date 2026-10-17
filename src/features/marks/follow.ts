import type { DiffFile } from "../../utils/diff-parser"
import { patchLines } from "./patch-lines"
import type { Mark } from "./types"

/**
 * How far from its old number a mark's text is looked for. A repeated line
 * far away (a closing brace, a blank line) is more likely different code
 * than the same line moved, so the search stops before it reaches one.
 */
export const FOLLOW_WINDOW = 50

/**
 * The marks re-placed in a diff whose commits moved under them: a renamed
 * file hands its marks to the new name, and a line mark whose text no
 * longer sits at its number moves to the nearest line within
 * FOLLOW_WINDOW that holds it, the upper one on a tie. A mark whose text is
 * nowhere near keeps its number for the jump to report. A mark set on
 * expanded context, whose lines the patch does not carry, has no text and
 * keeps its number too. A mark whose file is not in `files` (single-file
 * mode, another scope) is kept as it is.
 *
 * `moved` says whether anything changed, so a caller saves only then.
 */
export function followMarks(
  marks: readonly Mark[],
  files: readonly DiffFile[],
  head: string | undefined
): { marks: Mark[]; moved: boolean } {
  const byName = new Map(files.map((f) => [f.filename, f]))
  const byOldName = new Map(files.filter((f) => f.oldFilename).map((f) => [f.oldFilename!, f]))

  let moved = false
  const followed = marks.map((mark) => {
    const next = follow(mark, byName.get(mark.filename) ?? byOldName.get(mark.filename), head)
    if (next !== mark) moved = true
    return next
  })
  return { marks: followed, moved }
}

function follow(mark: Mark, file: DiffFile | undefined, head: string | undefined): Mark {
  if (!file) return mark
  const renamed = file.filename === mark.filename ? mark : { ...mark, filename: file.filename }
  if (renamed.line === null || renamed.text === undefined) return renamed

  const line = findText(patchLines(file, renamed.side), renamed.line, renamed.text)
  if (line === null || line === renamed.line) return renamed
  return head === undefined ? { ...renamed, line } : { ...renamed, line, head }
}

/** Outwards from where it was, so the nearest match wins when a line repeats. */
function findText(lines: ReadonlyMap<number, string>, from: number, text: string): number | null {
  if (lines.get(from) === text) return from
  for (let offset = 1; offset <= FOLLOW_WINDOW; offset++) {
    for (const candidate of [from - offset, from + offset]) {
      if (lines.get(candidate) === text) return candidate
    }
  }
  return null
}

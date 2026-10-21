import type { DiffFile } from "../../utils/diff-parser"
import type { ExcerptLine } from "./position"

export interface Hunk {
  header: string
  lines: ExcerptLine[]
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

const KINDS: Record<string, ExcerptLine["kind"]> = { "+": "added", "-": "removed", " ": "context" }

// The rules are patchLines': nothing before the first header counts, and "\ No newline" is not a line.
export function hunksOf(file: DiffFile): Hunk[] {
  const hunks: Hunk[] = []
  let oldLine = 0
  let newLine = 0
  for (const raw of file.content.split("\n")) {
    const header = HUNK_HEADER.exec(raw)
    if (header) {
      oldLine = Number(header[1])
      newLine = Number(header[2])
      hunks.push({ header: raw, lines: [] })
      continue
    }
    const hunk = hunks.at(-1)
    const kind = KINDS[raw[0] ?? ""]
    if (!hunk || !kind) continue

    const text = raw.slice(1)
    if (kind === "added") hunk.lines.push({ kind, text, newLine: newLine++ })
    else if (kind === "removed") hunk.lines.push({ kind, text, oldLine: oldLine++ })
    else hunk.lines.push({ kind, text, oldLine: oldLine++, newLine: newLine++ })
  }
  return hunks
}

const number = (n?: number) => (n === undefined ? "" : String(n)).padStart(5)

// Old and new numbers on every line, so the agent quotes `path:line` without counting from the
// hunk header itself.
export function formatDiffLine(line: ExcerptLine): string {
  const sign = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "
  return `${number(line.oldLine)} ${number(line.newLine)} ${sign}${line.text}`
}

export const hunkLines = (hunk: Hunk) => [hunk.header, ...hunk.lines.map(formatDiffLine)]

// What read_diff pages through and what an @file attaches: one text, so the agent's offsets agree.
export const fileDiffLines = (file: DiffFile) => hunksOf(file).flatMap(hunkLines)

export function countsOf(file: DiffFile): string {
  return /^@@ /m.test(file.content) ? `+${file.additions} -${file.deletions}` : "no line changes"
}

export const describeFile = (file: DiffFile) =>
  `${file.status} ${file.oldFilename ? `${file.oldFilename} -> ` : ""}${file.filename} (${countsOf(file)})`

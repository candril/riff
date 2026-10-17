import type { DiffFile } from "../../utils/diff-parser"
import type { Mark } from "./types"

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * Each line number the file's patch carries on one side, with its text
 * untrimmed and without the diff's prefix. Read from the patch rather than
 * the parsed rows: those live in a small LRU and cover only the files parsed
 * last. Lines shown only as expanded context are not in the patch.
 */
export function patchLines(file: DiffFile, side: Mark["side"]): Map<number, string> {
  const lines = new Map<number, string>()
  let oldLine = 0
  let newLine = 0
  let inHunk = false
  for (const raw of file.content.split("\n")) {
    const header = HUNK_HEADER.exec(raw)
    if (header) {
      oldLine = Number(header[1])
      newLine = Number(header[2])
      inHunk = true
      continue
    }
    if (!inHunk || raw.startsWith("\\")) continue

    const prefix = raw[0]
    const onOld = prefix === " " || prefix === "-"
    const onNew = prefix === " " || prefix === "+"
    if (!onOld && !onNew) continue

    if (side === "LEFT" ? onOld : onNew) lines.set(side === "LEFT" ? oldLine : newLine, raw.slice(1))
    if (onOld) oldLine++
    if (onNew) newLine++
  }
  return lines
}

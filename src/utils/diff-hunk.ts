const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/**
 * The context stored with a comment: up to `contextLines` rows of the diff
 * ending at the commented line, in GitHub's shape. `riff comments` reads the
 * anchored line back from the hunk's last row on that side
 * (anchorLineFromHunk), so the window must end exactly there.
 *
 * Null when the line is in no hunk — context expanded outside the diff —
 * since any other window would describe a different line.
 */
export function diffHunkAt(
  diffContent: string,
  line: number,
  side: "LEFT" | "RIGHT",
  contextLines = 5
): string | null {
  const visible: string[] = []
  let inHunk = false
  let oldLine = 0
  let newLine = 0

  for (const row of diffContent.split("\n")) {
    const header = HUNK_HEADER.exec(row)
    if (header) {
      inHunk = true
      oldLine = Number(header[1])
      newLine = Number(header[2])
      visible.push(row)
      continue
    }
    if (row.startsWith("diff ")) inHunk = false
    if (!inHunk) continue

    const marker = row[0]
    if (marker !== " " && marker !== "+" && marker !== "-" && marker !== "\\") continue
    visible.push(row)

    const hit =
      (side === "LEFT" && marker !== "+" && marker !== "\\" && oldLine === line) ||
      (side === "RIGHT" && marker !== "-" && marker !== "\\" && newLine === line)
    if (hit) return visible.slice(-contextLines).join("\n")

    if (marker === " " || marker === "-") oldLine++
    if (marker === " " || marker === "+") newLine++
  }
  return null
}

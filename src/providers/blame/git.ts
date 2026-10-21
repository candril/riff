import { shortShaOf, type BlameCommit, type BlameLine } from "./types"

const UNCOMMITTED = /^0{40}$/
const GROUP_HEADER = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/

/** The author's own wall-clock time with its offset, as git recorded it. */
function isoFrom(seconds: number, tz: string): string {
  const match = tz.match(/^([+-])(\d\d)(\d\d)$/)
  if (!match) return new Date(seconds * 1000).toISOString().replace(".000Z", "Z")
  const offsetMinutes = (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
  const local = new Date((seconds + offsetMinutes * 60) * 1000).toISOString().slice(0, 19)
  return `${local}${match[1]}${match[2]}:${match[3]}`
}

/**
 * `git blame --porcelain` names a commit's author, time and summary only the first time the commit
 * appears; every later group for it is the bare header line, so what was read is carried per sha.
 */
export function parseGitBlamePorcelain(text: string): BlameLine[] {
  const blame: BlameLine[] = []
  const headers = new Map<string, Record<string, string>>()
  let current: { sha: string; line: number } | null = null

  for (const row of text.split("\n")) {
    if (row.startsWith("\t")) {
      if (!current) continue
      const { sha, line } = current
      if (UNCOMMITTED.test(sha)) {
        blame[line] = { kind: "uncommitted" }
      } else {
        const fields = headers.get(sha) ?? {}
        const commit: BlameCommit = {
          sha,
          shortSha: shortShaOf(sha),
          author: fields.author ?? "",
          date: isoFrom(Number(fields["author-time"] ?? 0), fields["author-tz"] ?? ""),
          subject: fields.summary ?? "",
        }
        blame[line] = { kind: "commit", commit }
      }
      current = null
      continue
    }
    const header = row.match(GROUP_HEADER)
    if (header) {
      current = { sha: header[1]!, line: Number(header[2]) }
      if (!headers.has(current.sha)) headers.set(current.sha, {})
      continue
    }
    if (!current) continue
    const space = row.indexOf(" ")
    if (space > 0) headers.get(current.sha)![row.slice(0, space)] = row.slice(space + 1)
  }
  return blame
}

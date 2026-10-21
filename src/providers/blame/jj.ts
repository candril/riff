import { shortShaOf, type BlameLine } from "./types"

/**
 * One record per line of the file, fields split by \x1f. The line's own content is left out: it
 * can hold any byte, \x1f and newlines included, and the diff already shows it.
 */
export const JJ_ANNOTATE_TEMPLATE =
  'line_number ++ "\\x1f" ++ commit.commit_id() ++ "\\x1f" ++ commit.author().name() ++ "\\x1f" ++ ' +
  'commit.author().timestamp().utc().format("%Y-%m-%dT%H:%M:%SZ") ++ "\\x1f" ++ ' +
  'commit.description().first_line() ++ "\\n"'

export function parseJjAnnotate(text: string): BlameLine[] {
  const blame: BlameLine[] = []
  for (const record of text.split("\n")) {
    const [line = "", sha = "", author = "", date = "", subject = ""] = record.split("\x1f")
    const number = Number(line)
    if (!sha || !Number.isInteger(number) || number < 1) continue
    blame[number] = { kind: "commit", commit: { sha, shortSha: shortShaOf(sha), author, date, subject } }
  }
  return blame
}

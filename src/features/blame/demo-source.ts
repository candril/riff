import type { BlameSource, LineBlame, LoadedFileBlame } from "../../providers/blame/source"
import type { BlameCommit } from "../../providers/blame/types"

const demoCommit = (tail: string, subject: string): BlameCommit => ({
  sha: `0000000000000000000000000000000000${tail}01`,
  shortSha: `0000${tail}`,
  author: "riff demo",
  date: "2026-01-01T00:00:00Z",
  subject,
})

const FIRST = demoCommit("dead", "The demo blames a file's first lines on one commit")
const LATER = demoCommit("beef", "And the rest on another")
const FIRST_PR = { number: 1, url: "https://github.com/riff-demo/demo/pull/1" }

export const DEMO_BLAME: LineBlame = { line: { kind: "commit", commit: FIRST }, pr: FIRST_PR }
export const DEMO_LATER_BLAME: LineBlame = { line: { kind: "commit", commit: LATER }, pr: null }

// Two commits, so the blame column shows where one run ends and the next begins.
const FIRST_COMMIT_LINES = 3
// The demo never reads its files' lengths; this outlasts every line it shows.
const DEMO_FILE_LINES = 5000

const demoLine = (line: number) => (line <= FIRST_COMMIT_LINES ? DEMO_BLAME : DEMO_LATER_BLAME)

const DEMO_FILE: LoadedFileBlame = {
  blame: Array.from({ length: DEMO_FILE_LINES + 1 }, (_, line) => (line === 0 ? undefined : demoLine(line).line)),
  prs: new Map([[FIRST.sha, FIRST_PR]]),
}

/** The blame `--demo` runs on. The demo promises no network, so it never asks jj, git or GitHub. */
export function demoBlameSource(): BlameSource {
  return {
    fileBlame: async () => DEMO_FILE,
    lineBlame: async (_path, _side, line) => demoLine(line),
  }
}

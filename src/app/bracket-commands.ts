/**
 * The `]`/`[` motions, one command each, keyed by the sequence they are
 * spelled as: the opener, the chord suffix of the second key.
 */

import type { AppState } from "../state"
import type { VimMotionHandler } from "../vim-diff/motion-handler"
import type { LinePeekState } from "../features/line-peek/state"
import type { BlamePeekState } from "../features/blame/peek-state"
import * as fileNavigation from "../features/file-navigation"
import * as threadMotion from "../features/thread-motion"
import * as marks from "../features/marks"

export interface BracketDeps {
  getState: () => AppState
  render: () => void
  vimHandler: Pick<VimMotionHandler, "moveToFile" | "moveToHunk">
  fileNavContext: fileNavigation.FileNavigationContext
  threadMotionContext: threadMotion.ThreadMotionContext
  marksContext: marks.MarksContext
  onCommitSelected: (sha: string | null) => void
  diffTakesMarkChord: () => boolean
  /** Whether the line peek is up, under which no bracket motion acts. */
  linePeek: Pick<LinePeekState, "open">
  /** Whether the blame peek is up, under which no bracket motion acts. */
  blamePeek: Pick<BlamePeekState, "open">
}

// Both spellings of a shifted letter are accepted because terminals differ
// in whether shift+letter reports the key name as lower- or uppercase. The
// first spelling of a command is the one its hint shows.
export const BRACKET_SEQUENCES = {
  "]f": "nextFile",
  "[f": "prevFile",
  "]u": "nextUnviewed",
  "[u": "prevUnviewed",
  "]o": "nextOutdated",
  "[o": "prevOutdated",
  "]r": "nextThread",
  "[r": "prevThread",
  "]n": "nextNewThread",
  "[n": "prevNewThread",
  "]R!": "nextThreadAny",
  "]r!": "nextThreadAny",
  "[R!": "prevThreadAny",
  "[r!": "prevThreadAny",
  "]g": "nextCommit",
  "[g": "prevCommit",
  "]m": "nextMark",
  "[m": "prevMark",
  "]c": "nextHunk",
  "[c": "prevHunk",
} as const

export type BracketCommand = (typeof BRACKET_SEQUENCES)[keyof typeof BRACKET_SEQUENCES]

/**
 * The commit `]g` (dir 1) or `[g` (dir -1) selects: the sha, null for all
 * commits, which both ends wrap through, or undefined with no commits.
 */
export function adjacentCommit(
  commits: readonly { sha: string }[],
  viewingCommit: string | null,
  dir: 1 | -1,
): string | null | undefined {
  if (commits.length === 0) return undefined
  if (viewingCommit === null) return (dir === 1 ? commits[0] : commits[commits.length - 1])!.sha
  const idx = commits.findIndex((c) => c.sha === viewingCommit)
  if (dir === 1) return idx >= commits.length - 1 ? null : commits[idx + 1]!.sha
  return idx <= 0 ? null : commits[idx - 1]!.sha
}

/** Each command returns false for a key it leaves to the layers behind, as `]m` does outside the diff. */
export function bracketCommands(deps: BracketDeps): Record<BracketCommand, () => boolean> {
  const fileStep = (dir: 1 | -1) => () => {
    if (deps.getState().selectedFileIndex === null) {
      deps.vimHandler.moveToFile(dir === 1 ? "next" : "prev")
      deps.render()
    } else {
      fileNavigation.navigateFileSelection(dir, deps.fileNavContext)
    }
    return true
  }
  const thread = (dir: 1 | -1, skipResolved: boolean, newOnly?: boolean) => () => {
    threadMotion.navigateToThread(dir, skipResolved, deps.threadMotionContext, newOnly)
    return true
  }
  const commit = (dir: 1 | -1) => () => {
    const s = deps.getState()
    const sha = adjacentCommit(s.commits, s.viewingCommit, dir)
    if (sha !== undefined) deps.onCommitSelected(sha)
    return true
  }
  const mark = (dir: 1 | -1) => () => {
    if (!deps.diffTakesMarkChord()) return false
    marks.stepToMark(dir, deps.marksContext)
    return true
  }
  const hunk = (dir: "next" | "prev") => () => {
    deps.vimHandler.moveToHunk(dir)
    deps.render()
    return true
  }
  return {
    nextFile: fileStep(1),
    prevFile: fileStep(-1),
    nextUnviewed: () => {
      fileNavigation.navigateToUnviewedFile(1, deps.fileNavContext)
      return true
    },
    prevUnviewed: () => {
      fileNavigation.navigateToUnviewedFile(-1, deps.fileNavContext)
      return true
    },
    nextOutdated: () => {
      fileNavigation.navigateToOutdatedFile(1, deps.fileNavContext)
      return true
    },
    prevOutdated: () => {
      fileNavigation.navigateToOutdatedFile(-1, deps.fileNavContext)
      return true
    },
    nextThread: thread(1, false),
    prevThread: thread(-1, false),
    // The comments that arrived since your last visit, in order (spec 069).
    nextNewThread: thread(1, false, true),
    prevNewThread: thread(-1, false, true),
    nextThreadAny: thread(1, true),
    prevThreadAny: thread(-1, true),
    nextCommit: commit(1),
    prevCommit: commit(-1),
    nextMark: mark(1),
    prevMark: mark(-1),
    nextHunk: hunk("next"),
    prevHunk: hunk("prev"),
  }
}

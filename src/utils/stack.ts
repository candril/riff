/**
 * Stacked PRs (spec 072): a PR whose base is another PR's branch, and how
 * that base has moved since this one branched from it.
 */

export interface StackInfo {
  /** The PR whose head this PR is based on. */
  basePr: { number: number; title: string }
  /** How the base sits against this PR's branch point. */
  status: "current" | "moved" | "rewritten"
  /** Commits the base has that this PR's branch point does not. */
  behindBy: number
}

/**
 * One check tells moved from rewritten: whether the merge base is still one
 * of the base PR's commits. If it is, the base merely grew and the diff is
 * still right. If it is not, the base's history no longer contains the point
 * this PR branched from — it was force-pushed — and the diff now carries the
 * base's changes as if they were this PR's.
 */
export function readStack(
  basePr: { number: number; title: string },
  compare: { behindBy: number; mergeBase: string },
  baseCommits: readonly { sha: string }[]
): StackInfo {
  if (compare.behindBy === 0) return { basePr, status: "current", behindBy: 0 }
  const stillThere = baseCommits.some(
    (commit) => compare.mergeBase.startsWith(commit.sha) || commit.sha.startsWith(compare.mergeBase)
  )
  return { basePr, status: stillThere ? "moved" : "rewritten", behindBy: compare.behindBy }
}

/** What the overview's metadata row says about it. */
export function stackText(stack: StackInfo): string {
  const base = `stacked on #${stack.basePr.number} ${stack.basePr.title}`
  switch (stack.status) {
    case "current":
      return base
    case "moved":
      return `${base} · base moved on by ${stack.behindBy} commit${stack.behindBy === 1 ? "" : "s"}`
    case "rewritten":
      return `${base} · base rewritten since you branched — rebase`
  }
}

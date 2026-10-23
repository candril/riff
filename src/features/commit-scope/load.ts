import type { AppState } from "../../state"
import { parseDiff, sortFiles, type DiffFile } from "../../utils/diff-parser"
import { contiguousRun, parentOfCommit } from "./span"

/** Where the review came from and how to ask it for commits' diffs. */
export interface CommitScopeLoadContext {
  getState: () => AppState
  target: string | undefined
  fetchCommitDiff: (owner: string, repo: string, sha: string) => Promise<string>
  fetchCommitRangeDiff: (owner: string, repo: string, base: string, head: string) => Promise<string>
  getLocalCommitDiff: (sha: string, target?: string) => Promise<string>
  getLocalCommitRangeDiff: (oldest: string, newest: string) => Promise<string>
  getCommitParentSha: (owner: string, repo: string, sha: string) => Promise<string>
}

/**
 * The revision a span's diff is measured from: the commit before its
 * oldest. That one is in the list riff already has, except for the first
 * commit of the review, whose predecessor the API has to name.
 */
export async function spanBaseRef(
  ctx: Pick<CommitScopeLoadContext, "getState" | "getCommitParentSha">,
  oldest: string,
): Promise<string | null> {
  const state = ctx.getState()
  const index = state.commits.findIndex((commit) => commit.sha === oldest)
  const previous = index === -1 ? undefined : state.commits[index + 1]
  if (previous) return previous.sha
  if (!state.prInfo) return null
  try {
    return await ctx.getCommitParentSha(state.prInfo.owner, state.prInfo.repo, oldest)
  } catch {
    return null
  }
}

/** One commit's patch, from whichever provider this review came from. */
async function commitPatch(ctx: CommitScopeLoadContext, sha: string): Promise<string> {
  const state = ctx.getState()
  return state.appMode === "pr" && state.prInfo
    ? await ctx.fetchCommitDiff(state.prInfo.owner, state.prInfo.repo, sha)
    : await ctx.getLocalCommitDiff(sha, ctx.target)
}

/**
 * The files a scope covers. A run is one cumulative diff; commits picked
 * with gaps between them are their own patches, oldest first, with a file
 * two of them touched carrying both sets of hunks — which is what
 * `git log -p` would have shown.
 */
export async function scopeFiles(ctx: CommitScopeLoadContext, scope: readonly string[]): Promise<DiffFile[]> {
  const state = ctx.getState()
  const run = contiguousRun(state.commits, scope)
  if (run) {
    const raw = state.appMode === "pr" && state.prInfo
      ? await ctx.fetchCommitRangeDiff(
          state.prInfo.owner,
          state.prInfo.repo,
          parentOfCommit(state.commits, state.prInfo.baseRef, run.oldest),
          run.newest
        )
      : await ctx.getLocalCommitRangeDiff(run.oldest, run.newest)
    return sortFiles(parseDiff(raw))
  }

  if (scope.length === 1) return sortFiles(parseDiff(await commitPatch(ctx, scope[0]!)))

  const merged = new Map<string, DiffFile>()
  for (const sha of [...scope].reverse()) {
    for (const file of parseDiff(await commitPatch(ctx, sha))) {
      const seen = merged.get(file.filename)
      merged.set(
        file.filename,
        seen
          ? {
              ...seen,
              additions: seen.additions + file.additions,
              deletions: seen.deletions + file.deletions,
              content: `${seen.content}\n${file.content}`,
            }
          : file
      )
    }
  }
  return sortFiles([...merged.values()])
}

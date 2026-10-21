import { $ } from "bun"
import { getCurrentRepoRef } from "../repo"
import { extractShellError, safeGhCommand } from "./exec"

/**
 * What GitHub says when a pull request has more files than it will put in
 * one diff — 300 of them. A rename across a monorepo's library passes that
 * without being a large change in any other sense: the PR this came from is
 * 331 files, 308 of them renames, +86/-55.
 */
const DIFF_TOO_LARGE = /exceeded the maximum number of files|diff too_large/i

/** One file of a pull request, as the files API describes it. */
export interface PrFileEntry {
  filename: string
  previous_filename?: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch?: string
}

/**
 * Fetch PR diff.
 *
 * `gh pr diff` is one request and the whole patch, so it stays the way in.
 * Past the file cap it is not a smaller answer but a 406, and the files API
 * — which has no cap — is where GitHub's own error points.
 */
export async function getPrDiff(
  prNumber: number,
  owner?: string,
  repo?: string
): Promise<string> {
  return safeGhCommand(async () => {
    const repoArgs = owner && repo ? ["-R", `${owner}/${repo}`] : []
    try {
      return await $`gh pr diff ${prNumber} ${repoArgs}`.text()
    } catch (err) {
      if (!DIFF_TOO_LARGE.test(extractShellError(err))) throw err
      return await getPrDiffFromFiles(prNumber, owner, repo)
    }
  })
}

/**
 * The patch assembled from what the files API says about each file.
 *
 * Every line of it is GitHub's own — the per-file `patch` verbatim, under
 * the headers git would have written — so `parseDiff` and everything after
 * it sees exactly the shape `gh pr diff` would have handed over.
 */
async function getPrDiffFromFiles(
  prNumber: number,
  owner?: string,
  repo?: string
): Promise<string> {
  let resolvedOwner = owner
  let resolvedRepo = repo
  if (!resolvedOwner || !resolvedRepo) {
    const current = await getCurrentRepoRef()
    if (!current) {
      throw new Error("Not in a git repository. Specify full repo: riff gh:owner/repo#123")
    }
    resolvedOwner = current.owner
    resolvedRepo = current.repo
  }

  const files = (await $`gh api --paginate repos/${resolvedOwner}/${resolvedRepo}/pulls/${prNumber}/files`.json()) as PrFileEntry[]
  return prFilesAsDiff(files)
}

/** The files API's entries as one patch, in the order it listed them. */
export function prFilesAsDiff(files: readonly PrFileEntry[]): string {
  return files.map(fileEntryAsPatch).join("")
}

/** One file's entry as the diff git would have written for it. */
function fileEntryAsPatch(file: PrFileEntry): string {
  const newPath = file.filename
  const oldPath = file.previous_filename ?? file.filename
  const added = file.status === "added"
  const removed = file.status === "removed"

  const lines = [`diff --git a/${oldPath} b/${newPath}`]
  if (added) lines.push("new file mode 100644")
  else if (removed) lines.push("deleted file mode 100644")
  else if (oldPath !== newPath) lines.push(`rename from ${oldPath}`, `rename to ${newPath}`)

  // A rename that moved no lines has no patch and needs none: the headers
  // are the whole change, which is what `gh pr diff` emits for one too.
  // 304 of this PR's 331 files are that.
  if (!file.patch && file.changes === 0) return lines.join("\n") + "\n"

  lines.push(`--- ${added ? "/dev/null" : `a/${oldPath}`}`, `+++ ${removed ? "/dev/null" : `b/${newPath}`}`)

  if (!file.patch) {
    // Changed lines GitHub will not put in a response: a binary, or a file
    // whose own patch is too big for one. A context row says so, the way
    // any other file riff cannot draw does — never a fabricated hunk, which
    // a comment could then be anchored to.
    lines.push("@@ -1,1 +1,1 @@", ` ${file.changes} changed lines GitHub did not send — binary, or too large for the API`)
    return lines.join("\n") + "\n"
  }

  const patch = file.patch.endsWith("\n") ? file.patch : `${file.patch}\n`
  return `${lines.join("\n")}\n${patch}`
}

/**
 * Fetch the diff for a specific commit in a PR
 */
export async function fetchCommitDiff(
  owner: string,
  repo: string,
  sha: string
): Promise<string> {
  return safeGhCommand(async () => {
    return await $`gh api repos/${owner}/${repo}/commits/${sha} -H "Accept: application/vnd.github.diff"`.text()
  })
}

/**
 * The cumulative diff of a span of commits: everything between the commit
 * the span starts from and its newest (spec 078). `base` is the parent of
 * the oldest commit, or the PR's base branch when the span starts at the
 * first commit.
 */
export async function fetchCommitRangeDiff(
  owner: string,
  repo: string,
  base: string,
  head: string
): Promise<string> {
  return safeGhCommand(async () => {
    return await $`gh api repos/${owner}/${repo}/compare/${`${base}...${head}`} -H "Accept: application/vnd.github.diff"`.text()
  })
}

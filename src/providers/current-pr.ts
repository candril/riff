import { $ } from "bun"

/**
 * Name of the branch (git) or nearest bookmark (jj) the working copy is on.
 * Throws when the repo has neither — a detached HEAD in a colocated jj repo
 * with no bookmarks, for instance.
 */
export async function detectCurrentBranch(): Promise<string> {
  try {
    const out = await $`jj bookmark list -r 'heads(::@ & bookmarks())' -T 'name ++ "\n"'`
      .quiet()
      .text()
    const name = out.trim().split("\n").filter(Boolean).pop()
    if (name) return name
  } catch {}

  const branch = (await $`git branch --show-current`.quiet().text()).trim()
  if (!branch) {
    throw new Error("no current branch or bookmark found")
  }
  return branch
}

/** What riff knows about the pull request a local branch already has. */
export interface BranchPr {
  number: number
  title: string
  state: "OPEN" | "CLOSED" | "MERGED"
  isDraft: boolean
  url: string
}

/**
 * The pull request for the branch riff is reading, or nothing (spec 079).
 *
 * Asked in the background on every local review: a branch with a PR open is
 * a branch someone is reviewing, and riff should say so rather than letting
 * you find out on GitHub.
 */
export async function findCurrentPr(): Promise<BranchPr | null> {
  try {
    const branch = await detectCurrentBranch()
    const json = (await $`gh pr view ${branch} --json number,title,state,isDraft,url`
      .quiet()
      .json()) as BranchPr
    return json?.number ? json : null
  } catch {
    return null
  }
}

export async function resolveCurrentPr(): Promise<number> {
  const branch = await detectCurrentBranch()
  try {
    const json = (await $`gh pr view ${branch} --json number`.quiet().json()) as {
      number: number
    }
    return json.number
  } catch {
    throw new Error(`no PR associated with '${branch}' — try 'gh pr create'`)
  }
}

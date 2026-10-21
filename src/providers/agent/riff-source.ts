import { $ } from "bun"
import type { AppState } from "../../state"
import { getPrBaseFileContent, getPrFileContent, type FileContentResult } from "../github"
import { detectVcs, getFileContent, getOldFileContent } from "../local"
import { TREE_CUT_OFF, type FileText, type ReviewSource } from "./review-source"

export interface RiffSourceReaders {
  prHead(owner: string, repo: string, number: number, path: string, headSha?: string): Promise<FileContentResult>
  prBase(
    owner: string,
    repo: string,
    number: number,
    path: string,
    baseRef: string,
    headSha?: string,
  ): Promise<FileContentResult>
  localHead(path: string, target?: string): Promise<string | null>
  localBase(path: string, target?: string): Promise<string | null>
  prTree(owner: string, repo: string, sha: string): Promise<{ paths: string[]; truncated: boolean }>
  // Null outside a repository.
  localTree(target?: string): Promise<string[] | null>
}

export interface RiffSourceDeps {
  state: () => AppState
  target: string | undefined
  headSha: () => string | null
  readers?: Partial<RiffSourceReaders>
}

async function githubTree(owner: string, repo: string, sha: string) {
  const response: { tree: { path: string; type: string }[]; truncated?: boolean } =
    await $`gh api repos/${owner}/${repo}/git/trees/${sha}?recursive=1`.quiet().json()
  return {
    paths: response.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path),
    truncated: response.truncated === true,
  }
}

// The revision a git review's diff runs to: `branch...HEAD` for a branch target, the right end of
// a range, and otherwise the commit getFileContent reads the head from.
function gitHeadOf(target: string): string {
  if (target.startsWith("branch:")) return "HEAD"
  if (target.includes("..")) return target.split("..").at(-1) || "HEAD"
  return target
}

async function vcsTree(target?: string): Promise<string[] | null> {
  const vcs = await detectVcs()
  if (vcs === "none") return null
  const listing =
    vcs === "jj"
      ? $`jj file list -r ${target ?? "@"}`
      : target
        ? $`git ls-tree -r --name-only ${gitHeadOf(target)}`
        : $`git ls-files`
  return (await listing.quiet().text()).split("\n").filter(Boolean)
}

const DEFAULT_READERS: RiffSourceReaders = {
  prHead: getPrFileContent,
  prBase: getPrBaseFileContent,
  localHead: getFileContent,
  localBase: getOldFileContent,
  prTree: githubTree,
  localTree: vcsTree,
}

const NOT_ON_GITHUB = /\b404\b|not found|not on github/i

function textOf(content: string): FileText {
  return content.slice(0, 8000).includes("\0") ? { kind: "binary" } : { kind: "text", text: content }
}

/**
 * The agent's view of the review riff has loaded. It reads the review's whole range, never the
 * commit in scope: the agent's line numbers then match the change the prompt describes, whatever
 * the reviewer is stepping through.
 */
export function createRiffSource(deps: RiffSourceDeps): ReviewSource {
  const read = { ...DEFAULT_READERS, ...deps.readers }
  const trees = new Map<string, Promise<readonly string[]>>()
  const prOf = () => {
    const state = deps.state()
    return state.appMode === "pr" ? state.prInfo : null
  }

  function prText(result: FileContentResult): FileText {
    if (result.ok) return textOf(result.content)
    if (NOT_ON_GITHUB.test(result.error)) return { kind: "missing" }
    throw new Error(result.error)
  }

  async function loadTree(): Promise<readonly string[]> {
    const pr = prOf()
    if (pr) {
      const sha = deps.headSha()
      if (!sha) throw new Error("the PR's head commit is not loaded yet")
      const { paths, truncated } = await read.prTree(pr.owner, pr.repo, sha)
      return truncated ? [...paths, TREE_CUT_OFF] : paths
    }
    const paths = await read.localTree(deps.target)
    return paths ?? deps.state().files.map((file) => file.filename)
  }

  return {
    files: () => deps.state().files,
    hiddenPaths: () => deps.state().ignoredFiles,
    comments: () => deps.state().comments,
    async fileText(path, side) {
      const pr = prOf()
      if (pr) {
        const sha = deps.headSha() ?? undefined
        return prText(
          side === "head"
            ? await read.prHead(pr.owner, pr.repo, pr.number, path, sha)
            : await read.prBase(pr.owner, pr.repo, pr.number, path, pr.baseRef, sha),
        )
      }
      const content =
        side === "head" ? await read.localHead(path, deps.target) : await read.localBase(path, deps.target)
      return content === null ? { kind: "missing" } : textOf(content)
    },
    tree() {
      const key = prOf() ? `pr:${deps.headSha()}` : `local:${deps.target ?? "@"}`
      const cached = trees.get(key)
      if (cached) return cached
      const loading = loadTree()
      trees.set(key, loading)
      // A failed listing is not remembered, so the next read tries again.
      loading.catch(() => trees.delete(key))
      return loading
    },
  }
}

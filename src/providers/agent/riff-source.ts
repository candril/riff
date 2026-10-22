import { $ } from "bun"
import type { AppState } from "../../state"
import type { FileContentResult, PrInfo } from "../github/types"
import { getPrBaseFileContent, getPrFileContent } from "../github/content"
import { gitSidesOf } from "../git-target"
import { detectVcs, getFileContent, getOldFileContent } from "../local"
import { TREE_CUT_OFF, type ConversationEntry, type FileText, type ReviewSource } from "./review-source"

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

async function vcsTree(target?: string): Promise<string[] | null> {
  const vcs = await detectVcs()
  if (vcs === "none") return null
  const listing =
    vcs === "jj"
      ? $`jj file list -r ${target ?? "@"}`
      : target
        ? $`git ls-tree -r --name-only ${gitSidesOf(target).head}`
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

// A pending review is the reviewer's own unsent draft, and a review without a body has nothing
// to read.
function conversationOf(pr: PrInfo): ConversationEntry[] {
  const comments = (pr.conversationComments ?? []).map(
    (c): ConversationEntry => ({
      kind: "comment",
      author: c.author,
      at: c.createdAt,
      body: c.body,
      reactions: c.reactions ?? [],
    }),
  )
  const reviews = (pr.reviews ?? []).flatMap((r): ConversationEntry[] =>
    r.state !== "PENDING" && r.submittedAt && r.body?.trim()
      ? [
          {
            kind: "review",
            author: r.author,
            at: r.submittedAt,
            body: r.body,
            state: r.state,
            reactions: r.reactions ?? [],
          },
        ]
      : [],
  )
  return [...comments, ...reviews].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

/**
 * The agent's view of the review riff has loaded. It reads the review's whole range, never the
 * commit in scope: the agent's line numbers then match the change the prompt describes, whatever
 * the reviewer is stepping through.
 */
export function createRiffSource(deps: RiffSourceDeps): ReviewSource {
  const read = { ...DEFAULT_READERS, ...deps.readers }
  const prTrees = new Map<string | null, Promise<readonly string[]>>()
  const prOf = () => {
    const state = deps.state()
    return state.appMode === "pr" ? state.prInfo : null
  }

  function prText(result: FileContentResult): FileText {
    if (result.ok) return textOf(result.content)
    if (NOT_ON_GITHUB.test(result.error)) return { kind: "missing" }
    throw new Error(result.error)
  }

  async function loadPrTree(owner: string, repo: string, sha: string | null): Promise<readonly string[]> {
    if (!sha) throw new Error("the PR's head commit is not loaded yet")
    const { paths, truncated } = await read.prTree(owner, repo, sha)
    return truncated ? [...paths, TREE_CUT_OFF] : paths
  }

  async function loadLocalTree(): Promise<readonly string[]> {
    const paths = await read.localTree(deps.target)
    return paths ?? deps.state().files.map((file) => file.filename)
  }

  return {
    files: () => deps.state().files,
    hiddenPaths: () => deps.state().ignoredFiles,
    comments: () => deps.state().comments,
    conversation() {
      const state = deps.state()
      if (state.appMode !== "pr") return null
      return state.prInfo ? conversationOf(state.prInfo) : "loading"
    },
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
    // Only a PR's tree is remembered, per head: listing it is a GitHub call, while a local listing
    // is a cheap spawn over a working copy that keeps changing while riff runs.
    tree() {
      const pr = prOf()
      if (!pr) return loadLocalTree()
      const sha = deps.headSha()
      const cached = prTrees.get(sha)
      if (cached) return cached
      const loading = loadPrTree(pr.owner, pr.repo, sha)
      prTrees.set(sha, loading)
      // A failed listing is not remembered, so the next read tries again.
      loading.catch(() => prTrees.delete(sha))
      return loading
    },
  }
}

import { $ } from "bun"
import type { AppState } from "../../state"
import { baseVersionRef, getPrHeadSha } from "../github/content"
import type { GitBase } from "../git-target"
import { detectVcs, resolveGitBase, type VcsType } from "../local"
import { getCurrentRepoRef, type RepoRef } from "../repo"
import { parseGitBlamePorcelain } from "./git"
import { BLAME_QUERY, parseGithubBlame } from "./github"
import { JJ_ANNOTATE_TEMPLATE, parseJjAnnotate } from "./jj"
import { prForCommit } from "./pr-lookup"
import { gitSide, jjSide, prSide, revisionLabel, type BlameSide, type SideRevision } from "./sides"
import type { BlameLine, FileBlame, PrRef } from "./types"

export interface BlameRunners {
  vcs(): Promise<VcsType>
  // Null when the file is not at that revision.
  jjAnnotate(rev: string, path: string): Promise<string | null>
  // A null rev blames the working tree.
  gitBlame(rev: string | null, path: string): Promise<string | null>
  gitBase(base: GitBase): Promise<string>
  prBase(owner: string, repo: string, number: number, baseRef: string, headSha: string): Promise<string>
  prHead(owner: string, repo: string, number: number): Promise<string>
  githubBlame(owner: string, repo: string, commit: string, path: string): Promise<unknown>
  repoRef(): Promise<RepoRef | null>
  prForCommit(owner: string, repo: string, sha: string): Promise<PrRef | null>
}

export interface BlameSourceDeps {
  state: () => AppState
  target: string | undefined
  headSha: () => string | null
  runners?: Partial<BlameRunners>
}

export interface LineBlame {
  line: BlameLine
  pr: PrRef | null
}

export interface LoadedFileBlame {
  blame: FileBlame
  // Only a PR's blame carries its PRs; a local one asks per commit.
  prs: ReadonlyMap<string, PrRef> | null
}

export interface BlameSource {
  /** Null for a file that side does not have. */
  fileBlame(path: string, side: BlameSide): Promise<LoadedFileBlame | null>
  /** Null past the end of the file, or for a file that side does not have. */
  lineBlame(path: string, side: BlameSide, line: number): Promise<LineBlame | null>
}

/**
 * jj's and git's words for a path the revision does not have. A bare "no
 * such file" would also swallow an unrelated ENOENT as a silent null.
 */
export function isMissingPath(message: string): boolean {
  return /no such path|cannot stat path/i.test(message)
}

async function spawnText(command: ReturnType<typeof $>): Promise<string | null> {
  const result = await command.quiet().nothrow()
  if (result.exitCode === 0) return result.text()
  const message = result.stderr.toString().trim()
  if (isMissingPath(message)) return null
  throw new Error(message || `exit code ${result.exitCode}`)
}

const DEFAULT_RUNNERS: BlameRunners = {
  vcs: detectVcs,
  jjAnnotate: (rev, path) => spawnText($`jj file annotate -r ${rev} -T ${JJ_ANNOTATE_TEMPLATE} ${path}`),
  gitBlame: (rev, path) =>
    spawnText(rev === null ? $`git blame --porcelain -- ${path}` : $`git blame --porcelain ${rev} -- ${path}`),
  gitBase: resolveGitBase,
  prBase: baseVersionRef,
  prHead: (owner, repo, number) => getPrHeadSha(number, owner, repo),
  async githubBlame(owner, repo, commit, path) {
    const text = await spawnText(
      $`gh api graphql -f query=${BLAME_QUERY} -f owner=${owner} -f name=${repo} -f expression=${commit} -f path=${path}`,
    )
    return text === null ? null : JSON.parse(text)
  },
  repoRef: getCurrentRepoRef,
  prForCommit,
}

/** Who last changed a line of the review, by the revisions the diff's line numbers count in. */
export function createBlameSource(deps: BlameSourceDeps): BlameSource {
  const run = { ...DEFAULT_RUNNERS, ...deps.runners }
  const files = new Map<string, Promise<LoadedFileBlame | null>>()

  async function sideRevision(side: BlameSide): Promise<SideRevision> {
    const state = deps.state()
    const pr = state.appMode === "pr" ? state.prInfo : null
    if (pr) {
      const head = deps.headSha() ?? (await run.prHead(pr.owner, pr.repo, pr.number))
      return prSide(side, pr.baseRef, head)
    }
    const vcs = await run.vcs()
    if (vcs === "none") throw new Error("not in a git or jj repository")
    return vcs === "jj" ? jjSide(side, deps.target) : gitSide(side, deps.target)
  }

  async function load(path: string, revision: SideRevision): Promise<LoadedFileBlame | null> {
    if (revision.tool === "jj") {
      const text = await run.jjAnnotate(revision.rev, path)
      return text === null ? null : { blame: parseJjAnnotate(text), prs: null }
    }
    if (revision.tool === "git") {
      const rev = revision.rev && (await run.gitBase(revision.rev))
      const text = await run.gitBlame(rev, path)
      return text === null ? null : { blame: parseGitBlamePorcelain(text), prs: null }
    }
    const pr = deps.state().prInfo!
    const commit =
      "commit" in revision.rev
        ? revision.rev.commit
        : await run.prBase(pr.owner, pr.repo, pr.number, ...revision.rev.mergeBaseOf)
    return parseGithubBlame(await run.githubBlame(pr.owner, pr.repo, commit, path))
  }

  function cached(path: string, revision: SideRevision): Promise<LoadedFileBlame | null> {
    // A working copy is edited while riff runs, so its blame is read fresh every time.
    if (revision.live) return load(path, revision)
    const key = `${path}@${revisionLabel(revision)}`
    const cached = files.get(key)
    if (cached) return cached
    const loading = load(path, revision)
    files.set(key, loading)
    loading.catch(() => files.delete(key))
    return loading
  }

  async function localPr(sha: string): Promise<PrRef | null> {
    const repo = await run.repoRef()
    if (!repo) return null
    // The PR is garnish on the commit, so a failed lookup costs only the PR.
    return run.prForCommit(repo.owner, repo.repo, sha).catch(() => null)
  }

  const fileBlame = async (path: string, side: BlameSide) => cached(path, await sideRevision(side))

  return {
    fileBlame,
    async lineBlame(path, side, line) {
      const loaded = await fileBlame(path, side)
      const entry = loaded?.blame[line]
      if (!loaded || !entry) return null
      if (entry.kind === "uncommitted") return { line: entry, pr: null }
      const pr = loaded.prs ? (loaded.prs.get(entry.commit.sha) ?? null) : await localPr(entry.commit.sha)
      return { line: entry, pr }
    },
  }
}

/**
 * Pure URL construction for GitHub blob permalinks.
 *
 * Kept free of app state so both the PR path (owner/repo/ref straight from
 * `PrInfo`) and the local path (owner/repo/ref shelled out of git or jj)
 * can share it.
 */

/** Everything needed to address a repo at a specific ref. */
export interface RepoRef {
  /** Scheme + host, e.g. "https://github.com". Carries GitHub Enterprise hosts. */
  origin: string
  owner: string
  repo: string
  /** Branch name, or a commit SHA when no branch could be resolved. */
  ref: string
}

export interface PermalinkTarget extends RepoRef {
  /** Repo-relative file path. */
  path: string
  /** 1-based first line of the range. Omitted for a file-level link. */
  startLine?: number
  /** 1-based last line. Omitted (or equal to startLine) for a single line. */
  endLine?: number
}

/**
 * Build a `https://host/owner/repo/blob/<ref>/<path>#L1-L2` URL.
 *
 * Slashes survive encoding in both the ref and the path: branch names like
 * `feat/foo` and nested paths must stay as separators, everything else is
 * percent-encoded.
 */
export function buildPermalinkUrl(target: PermalinkTarget): string {
  const ref = encodePathish(target.ref)
  const path = encodePathish(target.path)
  const base = `${target.origin}/${target.owner}/${target.repo}/blob/${ref}/${path}`
  const anchor = lineAnchor(target.startLine, target.endLine)
  if (!anchor) return base
  // A file-level link is better off rendered, so `?plain=1` is added only
  // when there are lines to land on.
  const query = rendersInsteadOfSource(target.path) ? "?plain=1" : ""
  return `${base}${query}#${anchor}`
}

/**
 * Extensions GitHub renders as prose on the blob page instead of showing the
 * source. The rendered view carries no line numbers, so an `#L20` anchor
 * resolves to nothing and the reader lands at the top of the document —
 * `?plain=1` forces the source view, where the anchor works.
 */
const RENDERED_EXTENSIONS = new Set([
  "md", "markdown", "mdown", "mkd", "mkdn", "mdwn", "mdtxt", "mdtext",
  "livemd", "ronn", "workbook",
  "rst",
  "adoc", "asciidoc", "asc",
  "org",
  "textile",
  "rdoc",
  "pod",
  "creole",
  "mediawiki", "wiki",
  "csv", "tsv",
  "ipynb",
])

function rendersInsteadOfSource(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1)
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return false
  return RENDERED_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}

/** "L12", "L12-L20", or "" when there is no line range. */
export function lineAnchor(startLine?: number, endLine?: number): string {
  if (startLine === undefined) return ""
  if (endLine === undefined || endLine === startLine) return `L${startLine}`
  const lo = Math.min(startLine, endLine)
  const hi = Math.max(startLine, endLine)
  return `L${lo}-L${hi}`
}

/** Where in the PR's Files-changed view a link should land. */
export interface PrDiffTarget {
  origin: string
  owner: string
  repo: string
  prNumber: number
  /** Commit whose diff to open, for the per-commit view. Omit for the full PR. */
  commitSha?: string
  /** Repo-relative file path. */
  path: string
  /** 1-based line, on `side`. Omitted to land on the file heading. */
  line?: number
  /** Which column the line lives in — deletions are only on the left. */
  side?: "LEFT" | "RIGHT"
}

/**
 * Build a link into the PR's Files-changed view, e.g.
 * `…/pull/42/files#diff-<hash>R12`.
 *
 * Unlike a blob link this shows the change in context — both columns, the
 * surrounding hunk, and any review comments — and it can address deleted
 * lines, which don't exist in the file a blob URL points at.
 */
export function buildPrDiffUrl(target: PrDiffTarget): string {
  const view = target.commitSha
    ? `files/${encodeURIComponent(target.commitSha)}`
    : "files"
  const base = `${target.origin}/${target.owner}/${target.repo}/pull/${target.prNumber}/${view}`
  return `${base}#${diffAnchor(target.path, target.line, target.side)}`
}

/**
 * GitHub ids each diff row as `diff-<sha256 of the file path><L|R><line>`,
 * and the file's own heading as just `diff-<sha256 of the file path>`.
 *
 * Verified against a real PR page rather than inferred: every one of the 85
 * changed files' anchors matched `sha256(path)`. There is no range form —
 * the page carries no `R12-R20`-style ids — so a multi-line selection can
 * only land on its first line.
 */
export function diffAnchor(
  path: string,
  line?: number,
  side?: "LEFT" | "RIGHT",
): string {
  const hash = new Bun.CryptoHasher("sha256").update(path).digest("hex")
  if (line === undefined) return `diff-${hash}`
  return `diff-${hash}${side === "LEFT" ? "L" : "R"}${line}`
}

function encodePathish(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/")
}

/**
 * Derive origin/owner/repo from a git remote URL.
 *
 * Handles the three forms remotes come in:
 *   git@host:owner/repo.git
 *   ssh://git@host/owner/repo.git
 *   https://host/owner/repo.git
 *
 * SSH remotes carry no scheme for the browser, so they map to https.
 */
export function parseRemoteUrl(remote: string): Omit<RepoRef, "ref"> | null {
  const trimmed = remote.trim()
  if (!trimmed) return null

  const scpLike = trimmed.match(/^(?:([^@]+)@)?([^:/]+):(.+)$/)
  const isScp = scpLike !== null && !trimmed.includes("://")
  const { host, pathPart } = isScp
    ? { host: scpLike![2]!, pathPart: scpLike![3]! }
    : parseUrlForm(trimmed)

  if (!host || !pathPart) return null

  const segments = pathPart.replace(/\.git$/, "").split("/").filter(Boolean)
  if (segments.length < 2) return null
  const repo = segments[segments.length - 1]!
  const owner = segments[segments.length - 2]!

  return { origin: `https://${host}`, owner, repo }
}

function parseUrlForm(remote: string): { host: string; pathPart: string } {
  try {
    const url = new URL(remote)
    return { host: url.host, pathPart: url.pathname }
  } catch {
    return { host: "", pathPart: "" }
  }
}

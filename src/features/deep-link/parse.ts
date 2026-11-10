/**
 * PR deep links (spec 115): a GitHub PR URL and the one place on the PR its
 * fragment names. The URL arrives from a browser click, by way of
 * Hammerspoon and a socket, so nothing outside this grammar is acted on.
 */

export type LinkSide = "LEFT" | "RIGHT"

export type LinkTarget =
  | { kind: "review-comment"; githubId: number }
  | { kind: "issue-comment"; githubId: number }
  | { kind: "review"; reviewId: number }
  | { kind: "file"; pathHash: string; line?: { side: LinkSide; number: number } }

/** A fragment riff can follow, or one it read and cannot. */
export type LinkFragment = { kind: "target"; target: LinkTarget } | { kind: "unknown"; fragment: string }

export interface PrLink {
  owner: string
  repo: string
  number: number
  /** Null when the URL has no fragment. */
  fragment: LinkFragment | null
}

// GitHub's own character set for owners and repositories. Holding to it keeps
// the slug the socket is named after free of anything a path could misread.
const NAME = "[A-Za-z0-9_.-]+"
// Any path after the number (`/files`, `/changes`, `/commits/<sha>`) and a
// query are what GitHub's own links carry; only the fragment says where.
const PR_URL = new RegExp(`^https?://(?:www\\.)?github\\.com/(${NAME})/(${NAME})/pull/(\\d+)(?:/[^?#]*)?(?:\\?[^#]*)?(?:#(.*))?$`)

const ID = "(\\d+)"
const FRAGMENTS: Array<[RegExp, (match: RegExpMatchArray) => LinkTarget | null]> = [
  [new RegExp(`^(?:discussion_)?r${ID}$`), (m) => idTarget(m[1]!, (githubId) => ({ kind: "review-comment", githubId }))],
  [new RegExp(`^issuecomment-${ID}$`), (m) => idTarget(m[1]!, (githubId) => ({ kind: "issue-comment", githubId }))],
  [new RegExp(`^pullrequestreview-${ID}$`), (m) => idTarget(m[1]!, (reviewId) => ({ kind: "review", reviewId }))],
  [/^diff-([0-9a-f]{64})(?:([LR])(\d+)(?:-[LR]\d+)?)?$/, fileTarget],
]

function idTarget(digits: string, build: (id: number) => LinkTarget): LinkTarget | null {
  const id = Number(digits)
  return Number.isSafeInteger(id) && id > 0 ? build(id) : null
}

function fileTarget(match: RegExpMatchArray): LinkTarget | null {
  const [, pathHash, side, line] = match
  if (!side) return { kind: "file", pathHash: pathHash! }
  const number = Number(line)
  if (!Number.isSafeInteger(number) || number < 1) return null
  // A range lands on its first line, on the side it starts on.
  return { kind: "file", pathHash: pathHash!, line: { side: side === "L" ? "LEFT" : "RIGHT", number } }
}

/** What a URL's fragment points at; null for no fragment at all. */
export function parseFragment(fragment: string): LinkFragment | null {
  if (fragment === "") return null
  for (const [pattern, build] of FRAGMENTS) {
    const match = fragment.match(pattern)
    if (!match) continue
    const target = build(match)
    return target ? { kind: "target", target } : { kind: "unknown", fragment }
  }
  return { kind: "unknown", fragment }
}

/** The PR a GitHub URL is for and where in it the fragment points; null for anything that is not a PR URL. */
export function parsePrLink(url: string): PrLink | null {
  const match = url.trim().match(PR_URL)
  if (!match) return null
  const number = Number(match[3])
  if (!Number.isSafeInteger(number) || number < 1) return null
  return { owner: match[1]!, repo: match[2]!, number, fragment: parseFragment(match[4] ?? "") }
}

/** GitHub treats owner and repository names without regard to case, and so does a link to one. */
export function samePr(link: Pick<PrLink, "owner" | "repo" | "number">, source: string): boolean {
  return `gh:${link.owner}/${link.repo}#${link.number}`.toLowerCase() === source.toLowerCase()
}

/**
 * A fragment fit to show in a toast: it came from outside, and a control
 * character in it would be written to the terminal as it stands.
 */
export function printableFragment(fragment: string, max = 40): string {
  const printable = fragment.replace(/[^\x20-\x7e]/g, "?")
  return printable.length > max ? `${printable.slice(0, max - 1)}…` : printable
}

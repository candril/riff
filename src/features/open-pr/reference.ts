import type { KnownRepo, RepoName } from "./known-repos"

export type PrReference =
  | { kind: "number"; number: number }
  | { kind: "named"; repo: string; number: number }
  | { kind: "full"; owner: string; repo: string; number: number }

const NAME = "[\\w.-]+"
const FORMS: { pattern: RegExp; read: (match: RegExpMatchArray) => PrReference }[] = [
  { pattern: /^#?(\d+)$/, read: (m) => ({ kind: "number", number: Number(m[1]) }) },
  {
    pattern: new RegExp(`github\\.com/(${NAME})/(${NAME})/pull/(\\d+)`),
    read: (m) => ({ kind: "full", owner: m[1]!, repo: m[2]!, number: Number(m[3]) }),
  },
  {
    pattern: new RegExp(`^(?:gh:)?(${NAME})/(${NAME})(?:/pull/|#|/)(\\d+)$`),
    read: (m) => ({ kind: "full", owner: m[1]!, repo: m[2]!, number: Number(m[3]) }),
  },
  {
    pattern: new RegExp(`^(${NAME})(?:#|/)(\\d+)$`),
    read: (m) => ({ kind: "named", repo: m[1]!, number: Number(m[2]) }),
  },
]

export function parsePrReference(text: string): PrReference | null {
  const bare = text.trim().replace(/^[<"'`]+|[>"'`]+$/g, "")
  for (const { pattern, read } of FORMS) {
    const match = bare.match(pattern)
    if (match) return read(match)
  }
  return null
}

export type Resolution =
  | { kind: "open"; owner: string; repo: string; number: number }
  | { kind: "ask"; number: number; repos: readonly KnownRepo[] }
  | { kind: "unknown"; message: string }

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const answersTo = (known: KnownRepo, name: string) =>
  same(known.repo, name) || (known.alias !== undefined && same(known.alias, name))

export function resolvePrReference(
  reference: PrReference,
  context: { current: RepoName | null; known: readonly KnownRepo[] }
): Resolution {
  const { current, known } = context
  const { number } = reference
  if (reference.kind === "full") return { kind: "open", owner: reference.owner, repo: reference.repo, number }

  if (reference.kind === "number") {
    if (current) return { kind: "open", owner: current.owner, repo: current.repo, number }
    if (known.length === 0) {
      return { kind: "unknown", message: `Not in a repository, so paste owner/repo#${number}` }
    }
    return { kind: "ask", number, repos: known }
  }

  const named = known.filter((repo) => answersTo(repo, reference.repo))
  const isCurrent = current !== null && same(current.repo, reference.repo)
  const alreadyListed = named.some((repo) => same(repo.owner, current?.owner ?? "") && same(repo.repo, current?.repo ?? ""))
  const matches: readonly KnownRepo[] = isCurrent && !alreadyListed ? [current, ...named] : named

  if (matches.length === 0) return { kind: "unknown", message: `No known repo is called ${reference.repo}, so paste owner/${reference.repo}#${number}` }
  if (matches.length > 1) return { kind: "ask", number, repos: matches }
  return { kind: "open", owner: matches[0]!.owner, repo: matches[0]!.repo, number }
}

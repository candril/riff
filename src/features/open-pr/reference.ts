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

// A paragraph that happens to hold a link is not a reference, and would not fit the field.
const LONGEST_CLIPBOARD_REFERENCE = 300

export function clipboardReference(
  clipboard: string | null,
  context: { current: RepoName | null; known: readonly KnownRepo[] }
): string | null {
  const text = clipboard?.trim()
  if (!text || text.length > LONGEST_CLIPBOARD_REFERENCE || text.includes("\n")) return null
  const reference = parsePrReference(text)
  if (!reference) return null
  // `docs/12` parses as repo/id; only a repo that answers to the name makes it one rather than a path.
  if (reference.kind === "named") return answeringTo(reference.repo, context).length > 0 ? text : null
  return resolvePrReference(reference, context).kind !== "unknown" ? text : null
}

export type Resolution =
  | { kind: "open"; owner: string; repo: string; number: number }
  | { kind: "ask"; number: number; repos: readonly KnownRepo[]; note?: string }
  | { kind: "unknown"; message: string }

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const contains = (text: string, part: string) => text.toLowerCase().includes(part.toLowerCase())

interface Context {
  current: RepoName | null
  known: readonly KnownRepo[]
}

function answeringTo(name: string, { current, known }: Context): readonly KnownRepo[] {
  const named = known.filter((repo) => same(repo.repo, name) || (repo.alias !== undefined && same(repo.alias, name)))
  if (!current || !same(current.repo, name)) return named
  const listed = named.some((repo) => same(repo.owner, current.owner) && same(repo.repo, current.repo))
  return listed ? named : [current, ...named]
}

export function resolvePrReference(reference: PrReference, context: Context): Resolution {
  const { current, known } = context
  const { number } = reference
  if (reference.kind === "full") return { kind: "open", owner: reference.owner, repo: reference.repo, number }

  if (reference.kind === "number") {
    if (current) return { kind: "open", owner: current.owner, repo: current.repo, number }
    if (known.length === 0) {
      return { kind: "unknown", message: `No GitHub repo detected here, so paste owner/repo#${number}` }
    }
    return { kind: "ask", number, repos: known }
  }

  const name = reference.repo
  const exact = answeringTo(name, context)
  if (exact.length === 1) return { kind: "open", owner: exact[0]!.owner, repo: exact[0]!.repo, number }
  if (exact.length > 1) return { kind: "ask", number, repos: exact }

  // Part of a name is a guess, even when only one repo fits it, so it is shown rather than opened.
  const partial = known.filter((repo) => contains(repo.repo, name) || (repo.alias !== undefined && contains(repo.alias, name)))
  if (partial.length > 0) return { kind: "ask", number, repos: partial }

  if (known.length === 0) return { kind: "unknown", message: `No known repo is called ${name}, so paste owner/${name}#${number}` }
  return { kind: "ask", number, repos: known, note: `No known repo is called ${name}` }
}

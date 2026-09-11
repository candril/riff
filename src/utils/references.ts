/**
 * The pull requests and issues a comment points at (spec 059).
 *
 * `#412`, `owner/repo#412` and a pasted GitHub URL all mean the same thing
 * and all read as nothing: a number tells the reader who wrote it what it
 * refers to and tells everyone else to go and look it up. Resolved, they can
 * carry the title and the state instead.
 */

import { fencedRanges } from "./comment-images"

export interface Reference {
  /** Exactly the text that was matched, so it can be replaced. */
  text: string
  owner: string | null
  repo: string | null
  number: number
  /** True when the reference was written as a URL. */
  url: boolean
  index: number
}

export interface ResolvedReference {
  title: string
  /** As GitHub reports it, lowercased: open, closed, merged, draft. */
  state: string
  /** Whether it is a pull request rather than an issue. */
  pull: boolean
}

/**
 * `#412`, `owner/repo#412`, and `repo#412` — which GitHub itself does not
 * link, but which people inside one organisation write constantly. The last
 * form is only ever shown once riff has confirmed it resolves: `C#5` reads
 * like a reference too, and a row pointing nowhere is worse than no row.
 */
const SHORT = /(^|[^\w/&])(?:([\w.-]+)\/)?([\w.-]+)?#(\d+)\b/g
const URL =
  /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:pull|issues)\/(\d+)(?:[#?][\w-]*)?/g

/** The key a resolved reference is remembered under. */
export function referenceKey(reference: Reference, fallback: Repo | null): string | null {
  const owner = reference.owner ?? fallback?.owner
  const repo = reference.repo ?? fallback?.repo
  if (!owner || !repo) return null
  return `${owner}/${repo}#${reference.number}`
}

export interface Repo {
  owner: string
  repo: string
}

export function findReferences(body: string): Reference[] {
  const skip = skippedRanges(body)
  const found: Reference[] = []

  for (const match of body.matchAll(URL)) {
    const index = match.index ?? 0
    if (inside(skip, index)) continue
    found.push({
      text: match[0],
      owner: match[1]!,
      repo: match[2]!,
      number: Number(match[3]),
      url: true,
      index,
    })
  }

  for (const match of body.matchAll(SHORT)) {
    const lead = match[1] ?? ""
    const index = (match.index ?? 0) + lead.length
    if (inside(skip, index)) continue
    // A `#12` inside a URL riff already matched as one is the same reference
    // written once, not two.
    if (found.some((other) => index >= other.index && index < other.index + other.text.length)) {
      continue
    }
    found.push({
      text: match[0].slice(lead.length),
      owner: match[2] ?? null,
      repo: match[3] ?? null,
      number: Number(match[4]),
      url: false,
      index,
    })
  }

  return found.sort((a, b) => a.index - b.index)
}

/**
 * Rewrite every reference riff has an answer for. Anything unresolved is
 * left exactly as the author wrote it.
 */
export function annotateReferences(
  body: string,
  resolved: ReadonlyMap<string, ResolvedReference>,
  repo: Repo | null,
): string {
  const references = findReferences(body)
  if (references.length === 0) return body

  let out = ""
  let cursor = 0

  for (const reference of references) {
    const key = referenceKey(reference, repo)
    const answer = key ? resolved.get(key) : undefined
    if (!answer) continue

    out += body.slice(cursor, reference.index)
    out += display(reference, answer, repo)
    cursor = reference.index + reference.text.length
  }

  return out + body.slice(cursor)
}

function display(reference: Reference, answer: ResolvedReference, repo: Repo | null): string {
  const label = `${referenceName(reference, repo)} ${answer.title} (${answer.state})`

  // A pasted URL becomes the link it was already standing in for; a `#412`
  // keeps its own shape and gains the title.
  return reference.url ? `[${label}](${reference.text})` : label
}

/**
 * What to call a reference: what its author wrote, unless they pasted a URL,
 * which nobody wants to read twice.
 */
export function referenceName(reference: Reference, repo: Repo | null): string {
  if (!reference.url) return reference.text

  const sameRepo = repo !== null && reference.owner === repo.owner && reference.repo === repo.repo
  return sameRepo
    ? `#${reference.number}`
    : `${reference.owner}/${reference.repo}#${reference.number}`
}

/** Ranges the reader is meant to read literally: code, and existing links. */
function skippedRanges(body: string): [number, number][] {
  const ranges: [number, number][] = [...fencedRanges(body)]

  for (const match of body.matchAll(/`[^`\n]*`/g)) {
    ranges.push([match.index ?? 0, (match.index ?? 0) + match[0].length])
  }
  // `[label](url)` — the label is what the author chose to show.
  for (const match of body.matchAll(/\[[^\]]*\]\([^)]*\)/g)) {
    ranges.push([match.index ?? 0, (match.index ?? 0) + match[0].length])
  }

  return ranges
}

function inside(ranges: [number, number][], index: number): boolean {
  return ranges.some(([start, end]) => index >= start && index < end)
}

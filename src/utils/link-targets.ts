/**
 * The links in a piece of text, ready to be picked from (spec 077).
 *
 * A rendered comment has no cursor to put on a link, so riff cannot ask
 * "this one?" the way `gx` does in the diff. It lists what is in there
 * instead, and a `#1213` is listed as what it points at rather than as a
 * number, because riff already looked that up (spec 059).
 */

import { findUrls } from "./links"
import { findReferences, referenceKey, type Repo, type ResolvedReference } from "./references"

export interface LinkTarget {
  /** What the picker shows — the reference, or the link's text. */
  label: string
  url: string
  /** The second column: a title, or the URL itself. */
  detail?: string
}

export interface LinkContext {
  repo: Repo | null
  resolved: ReadonlyMap<string, ResolvedReference>
}

/** Every link in the text, in the order it is written. */
export function collectLinks(text: string, ctx: LinkContext): LinkTarget[] {
  if (!text) return []

  const targets: Array<LinkTarget & { index: number }> = []
  const claimed: Array<{ start: number; end: number }> = []

  for (const reference of findReferences(text)) {
    const owner = reference.owner ?? ctx.repo?.owner
    const repo = reference.repo ?? ctx.repo?.repo
    if (!owner || !repo) continue

    claimed.push({ start: reference.index, end: reference.index + reference.text.length })

    const key = referenceKey(reference, ctx.repo)
    const answer = key ? ctx.resolved.get(key) : undefined
    const sameRepo = owner === ctx.repo?.owner && repo === ctx.repo?.repo
    targets.push({
      index: reference.index,
      label: sameRepo ? `#${reference.number}` : `${owner}/${repo}#${reference.number}`,
      // An unresolved reference is sent to `/issues/`, which GitHub
      // redirects to the pull request when that is what it turns out to be.
      url: `https://github.com/${owner}/${repo}/${answer?.pull === false ? "issues" : "pull"}/${reference.number}`,
      detail: answer ? `${answer.title} (${answer.state})` : undefined,
    })
  }

  for (const found of findUrls(text)) {
    // A reference written as a URL is already in the list, said better.
    if (claimed.some((span) => found.index >= span.start && found.index < span.end)) continue
    targets.push({
      index: found.index,
      label: found.label ?? shorten(found.url),
      url: found.url,
      detail: found.label ? found.url : undefined,
    })
  }

  const seen = new Set<string>()
  return targets
    .sort((a, b) => a.index - b.index)
    .filter((target) => {
      // The same PR named three times in a paragraph is one place to go.
      if (seen.has(target.url)) return false
      seen.add(target.url)
      return true
    })
    .map(({ index: _index, ...target }) => target)
}

/**
 * A URL as a label. The scheme is noise, and so is a tracking query — the
 * reader is picking between places, not reading the address.
 */
function shorten(url: string): string {
  const bare = url.replace(/^https?:\/\//i, "").replace(/[?#].*$/, "")
  if (bare.length <= 60) return bare
  const [host, ...rest] = bare.split("/")
  const tail = rest.filter(Boolean).pop()
  return tail ? `${host}/…/${tail}` : bare.slice(0, 60)
}

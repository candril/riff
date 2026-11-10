/**
 * PR deep links (spec 115): a link to a comment, a review or a file of a PR
 * opens riff there, at startup or in the riff already showing the PR.
 */

import { parsePrLink, samePr, type LinkFragment } from "./parse"
import { listenForLinks, socketPath, type LinkServer } from "./socket"

export { followLink, type DeepLinkJumpDeps } from "./jump"
export { parseFragment, parsePrLink, type LinkFragment, type LinkTarget, type PrLink } from "./parse"
export { listenForLinks, sendLink, socketPath, type LinkServer, type SendOutcome } from "./socket"

/**
 * The reply to a link sent to the review of `source`: `ok` once `follow` has
 * been handed its fragment — a fragment riff cannot follow is the review's
 * to say so, on screen — and an error for a link to anything else.
 */
export function answerLink(url: string, source: string, follow: (fragment: LinkFragment | null) => void): string {
  const link = parsePrLink(url)
  if (!link) throw new Error("not a GitHub pull request link")
  if (!samePr(link, source)) throw new Error(`this riff is showing ${source}, not ${link.owner}/${link.repo}#${link.number}`)
  follow(link.fragment)
  return "ok"
}

/**
 * Listen for links to the PR `source` is, for as long as the process runs.
 * Never fails riff: without a socket a second link opens a second riff,
 * which is what it did before there was one.
 */
export async function serveLinks(source: string, follow: (fragment: LinkFragment | null) => void): Promise<LinkServer | null> {
  try {
    const server = await listenForLinks(socketPath(source), (url) => answerLink(url, source, follow))
    if (server) process.once("exit", server.close)
    return server
  } catch {
    return null
  }
}

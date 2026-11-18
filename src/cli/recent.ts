/**
 * `riff recent` (spec 118): the reviews riff opened, newest first, from
 * ~/.riff/recent.json. Reads only; never starts the TUI.
 */

import { homedir } from "os"
import { loadRecent, type RecentReview } from "../storage/recent"

export const RECENT_USAGE = "usage: riff recent [--json]"

export interface RecentCliDeps {
  load: () => RecentReview[]
  now: () => Date
  out: (text: string) => void
  error: (line: string) => void
}

const liveDeps: RecentCliDeps = {
  load: () => loadRecent(),
  now: () => new Date(),
  out: (text) => console.log(text),
  error: (line) => console.error(line),
}

function ago(iso: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 1000))
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 2 * 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

const tilde = (path: string) => (path.startsWith(homedir()) ? `~${path.slice(homedir().length)}` : path)

export function formatRecent(reviews: RecentReview[], now: Date): string {
  if (!reviews.length) return "No reviews yet."
  return reviews
    .map((review) => {
      const when = `${ago(review.openedAt, now)}${review.closedAt ? "" : " *"}`.padEnd(6)
      return review.kind === "pr"
        ? `${when}${review.owner}/${review.repo}#${review.number}  ${review.title}`
        : `${when}${tilde(review.directory)}  ${review.target ?? "(working copy)"}`
    })
    .join("\n")
}

export function runRecentCli(args: string[], deps: RecentCliDeps = liveDeps): number {
  const json = args[0] === "--json"
  if (args.length > (json ? 1 : 0)) {
    deps.error(RECENT_USAGE)
    return 1
  }
  const reviews = deps.load()
  deps.out(json ? JSON.stringify(reviews, null, 2) : formatRecent(reviews, deps.now()))
  return 0
}

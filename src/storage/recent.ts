import { homedir } from "os"
import { dirname, join } from "path"
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "fs"

/** Global, like usage.json: the question it answers is what you reviewed, wherever that was. */
export const RECENT_PATH = join(homedir(), ".riff", "recent.json")

/** Enough for weeks of reviews; the file is rewritten on every open, so it stays small. */
const LIMIT = 200

interface Times {
  openedAt: string
  /** Set when that riff quits; absent while it runs, or when it was killed outright. */
  closedAt?: string
}

export type RecentReview =
  | ({ kind: "pr"; url: string; owner: string; repo: string; number: number; title: string; directory: string } & Times)
  /** `target` as typed: a revision, a `<workspace>@`, a path relative to `directory`, or null for the working copy. */
  | ({ kind: "local"; target: string | null; directory: string } & Times)

/** The same review opened twice is one entry: a PR wherever it was opened from, a local one per directory and target. */
export function recentKey(review: RecentReview): string {
  return review.kind === "pr" ? review.url : `${review.directory}\0${review.target ?? ""}`
}

const isString = (value: unknown): value is string => typeof value === "string"

function parseReview(value: unknown): RecentReview | null {
  if (!value || typeof value !== "object") return null
  const entry = value as Record<string, unknown>
  if (!isString(entry.openedAt) || !isString(entry.directory)) return null
  const times: Times = isString(entry.closedAt)
    ? { openedAt: entry.openedAt, closedAt: entry.closedAt }
    : { openedAt: entry.openedAt }
  if (entry.kind === "pr") {
    const { url, owner, repo, number, title } = entry
    if (!isString(url) || !isString(owner) || !isString(repo) || typeof number !== "number" || !isString(title)) return null
    return { kind: "pr", url, owner, repo, number, title, directory: entry.directory, ...times }
  }
  if (entry.kind === "local" && (entry.target === null || isString(entry.target))) {
    return { kind: "local", target: entry.target, directory: entry.directory, ...times }
  }
  return null
}

/** Newest first. A missing or unreadable file is an empty history; an entry riff cannot read is skipped. */
export function loadRecent(path: string = RECENT_PATH): RecentReview[] {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"))
    return Array.isArray(parsed?.reviews)
      ? parsed.reviews.map(parseReview).filter((review: RecentReview | null): review is RecentReview => review !== null)
      : []
  } catch {
    return []
  }
}

/** Renamed into place so another riff, or a tool reading the file, never sees half of it. */
function saveRecent(reviews: RecentReview[], path: string) {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify({ reviews }, null, 2))
  renameSync(temp, path)
}

/**
 * Puts a review at the top, replacing its earlier entry. Each write re-reads
 * the file first, so riffs running side by side all land. Synchronous so the
 * close written on process exit lands; a failed write is dropped, since a
 * history must never stop a review.
 */
export function recordOpened(review: RecentReview, path: string = RECENT_PATH): void {
  try {
    const key = recentKey(review)
    const rest = loadRecent(path).filter((entry) => recentKey(entry) !== key)
    saveRecent([review, ...rest].slice(0, LIMIT), path)
  } catch {}
}

export function recordClosed(key: string, at: Date = new Date(), path: string = RECENT_PATH): void {
  try {
    const reviews = loadRecent(path)
    const review = reviews.find((entry) => recentKey(entry) === key)
    if (!review) return
    review.closedAt = at.toISOString()
    saveRecent(reviews, path)
  } catch {}
}

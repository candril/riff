/**
 * Preview links (spec 068).
 *
 * Deploy bots post where they put this PR as a markdown table, and a table
 * of thirty 110-character URLs is unreadable in a terminal however well it
 * is rendered. The links are what matter, so riff lifts them out of the
 * table and shows them as what they are: a list of places you can open.
 *
 * Detection is configured rather than compiled in, with defaults that cover
 * the common bots — a table with a `Preview` column, or any link carrying
 * this PR's number, which is what `preview-pr10747` and Vercel's and
 * Netlify's equivalents all do.
 */

import type { PreviewsConfig } from "../config/schema"
import { splitRow, isDelimiterRow } from "./markdown-tables"

export interface PreviewLink {
  label: string
  url: string
}

export interface PreviewRow {
  /** The row's first cell — the app the links belong to. */
  app: string
  links: PreviewLink[]
  /** An italic cell (`*on demand*`) is a state, not a dead link. */
  status?: string
  /** The last column: when it was built, and the run that built it. */
  built?: PreviewLink
}

export interface PreviewSet {
  rows: PreviewRow[]
  /** The comment these were lifted out of, so it can be folded away. */
  commentId: string
  author: string
  createdAt: string
}

interface CommentLike {
  id: number | string
  body: string
  author: string
  createdAt: string
}

const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const ITALIC_CELL = /^[*_](.+)[*_]$/

/**
 * Find the preview table in a PR's conversation, if one is there.
 *
 * The newest matching comment wins: a bot that re-posts on every push has
 * left older tables pointing at deployments that are gone.
 */
export function detectPreviews(
  comments: readonly CommentLike[],
  config: PreviewsConfig,
  prNumber: number
): PreviewSet | null {
  for (let i = comments.length - 1; i >= 0; i--) {
    const comment = comments[i]!
    if (config.commentMarker && !comment.body.includes(config.commentMarker)) {
      // A marker is an explicit "this is the one" — when it is configured
      // and absent, no amount of table-shaped text makes this the comment.
      continue
    }
    const rows = extractPreviewRows(comment.body, config, prNumber)
    if (rows.length === 0) continue
    return {
      rows,
      commentId: String(comment.id),
      author: comment.author,
      createdAt: comment.createdAt,
    }
  }
  return null
}

/**
 * Turn a comment body into preview rows. Empty when nothing in it looks
 * like a table of previews.
 */
export function extractPreviewRows(
  body: string,
  config: PreviewsConfig,
  prNumber: number
): PreviewRow[] {
  const lines = body.split("\n")

  for (let start = 0; start < lines.length; start++) {
    const header = splitRow(lines[start]!)
    if (header.cells.length < 2) continue
    const delimiter = lines[start + 1]
    if (delimiter === undefined || !isDelimiterRow(splitRow(delimiter).cells)) continue

    const previewColumn = header.cells.findIndex(
      (cell) => cell.toLowerCase() === config.tableColumn.toLowerCase()
    )

    const rows: PreviewRow[] = []
    // A status row cannot make a table a table of previews; only links can,
    // or the bot's own marker saying so.
    const marked = Boolean(config.commentMarker && body.includes(config.commentMarker))

    for (let i = start + 2; i < lines.length; i++) {
      const line = lines[i]!
      if (!line.includes("|")) break
      const { cells } = splitRow(line)
      if (cells.length < 2) break

      const row = buildRow(cells, previewColumn, config, prNumber)
      if (row) rows.push(row)
    }

    if (rows.length > 0 && (marked || rows.some((row) => row.links.length > 0))) return rows
  }

  return []
}

function buildRow(
  cells: string[],
  previewColumn: number,
  config: PreviewsConfig,
  prNumber: number
): PreviewRow | null {
  const app = stripMarkdown(cells[0] ?? "")
  if (!app) return null

  // Two ways to know which links are previews, and a table only needs one:
  // the column the bot named them in, or the PR number they carry.
  const named = previewColumn >= 0
  const linkCells = named ? [cells[previewColumn] ?? ""] : cells.slice(1)
  const all = linkCells.flatMap(parseLinks)

  // A row that qualified at all keeps every link in it — that is how the
  // BrowserStack links in a mobile row survive alongside the preview URL.
  const links =
    named || all.some((link) => qualifies(link.url, config, prNumber)) ? all : []

  const status = links.length === 0 ? statusOf(linkCells) : undefined
  if (links.length === 0 && !status) return null

  const last = cells[cells.length - 1] ?? ""
  const builtLinks = parseLinks(last)
  const built =
    previewColumn >= 0 && cells.length - 1 !== previewColumn
      ? builtLinks[0] ?? (stripMarkdown(last) ? { label: stripMarkdown(last), url: "" } : undefined)
      : undefined

  return { app, links, status, built }
}

/** An italic cell is a state the bot is reporting, not a link it forgot. */
function statusOf(cells: string[]): string | undefined {
  for (const cell of cells) {
    const text = cell.trim()
    const italic = ITALIC_CELL.exec(text)
    if (italic) return italic[1]!.trim()
  }
  return undefined
}

export function parseLinks(cell: string): PreviewLink[] {
  const links: PreviewLink[] = []
  for (const match of cell.matchAll(MARKDOWN_LINK)) {
    const label = stripMarkdown(match[1] ?? "")
    const url = match[2] ?? ""
    if (url.startsWith("http")) links.push({ label: label || url, url })
  }
  return links
}

/**
 * Whether a URL is a preview of *this* PR. Two rules, both configurable:
 * the number appears in the host or path, or the host is one the reader
 * named.
 */
function qualifies(url: string, config: PreviewsConfig, prNumber: number): boolean {
  if (config.matchPrNumber && new RegExp(`(^|[^0-9])${prNumber}([^0-9]|$)`).test(url)) return true
  return config.hosts.some((pattern) => hostMatches(url, pattern))
}

function hostMatches(url: string, pattern: string): boolean {
  const host = hostOf(url)
  if (!host) return false
  if (!pattern.includes("*")) return host === pattern
  const regex = new RegExp(`^${pattern.split("*").map(escapeRegex).join(".*")}$`)
  return regex.test(host)
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Cell text without the markup that made it a link, an emoji aside. */
function stripMarkdown(cell: string): string {
  return cell
    .replace(MARKDOWN_LINK, "$1")
    .replace(/[*_`]/g, "")
    .replace(/<[^>]+>/g, "")
    .trim()
}

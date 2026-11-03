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
  /**
   * The task-list item that asks the bot to deploy this app (spec 113).
   * `line` is the item exactly as the comment has it, which is how a
   * fresh copy of the body is checked to still be asking the same thing.
   */
  deploy?: { checked: boolean; line: string }
}

/**
 * What a row is doing, as far as its cells and its task say (spec 113).
 * `live` has links to open, whether or not a newer build is on its way.
 */
export type PreviewState = "live" | "deployable" | "requested" | "building" | "idle"

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

    if (rows.length > 0 && (marked || rows.some((row) => row.links.length > 0))) return withDeployTasks(rows, lines)
  }

  return []
}

const TASK_ITEM = /^\s*[-*] \[([ xX])\] (.+)$/

/**
 * Bots that deploy on demand put a task list under the table, one item per
 * app, and tick-to-deploy is the whole interface. An item belongs to the
 * longest app label it names, so `Shop` does not take `Shop MCP`'s item.
 */
function withDeployTasks(rows: PreviewRow[], lines: string[]): PreviewRow[] {
  const tasks = new Map<number, NonNullable<PreviewRow["deploy"]>>()
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "")
    const item = TASK_ITEM.exec(line)
    if (!item) continue
    const text = normalizeLabel(stripMarkdown(item[2]!))
    let owner = -1
    rows.forEach((row, index) => {
      if (!namesApp(text, normalizeLabel(row.app))) return
      if (owner < 0 || row.app.length > rows[owner]!.app.length) owner = index
    })
    if (owner >= 0 && !tasks.has(owner)) tasks.set(owner, { checked: item[1] !== " ", line })
  }
  return rows.map((row, index) => {
    const deploy = tasks.get(index)
    return deploy ? { ...row, deploy } : row
  })
}

function namesApp(text: string, app: string): boolean {
  const at = text.indexOf(app)
  if (at < 0) return false
  const after = text[at + app.length]
  return after === undefined || !/[\p{L}\p{N}]/u.test(after)
}

/**
 * The same label as the table and the task list spell it: a bot keeps a
 * cell from wrapping with non-breaking spaces, and an emoji arrives with
 * or without its variation selector depending on who typed it.
 */
function normalizeLabel(text: string): string {
  return text.replace(/️/g, "").replace(/\s+/g, " ").trim()
}

/** The row's state, from its links, its status, its build cell and its task. */
export function previewState(row: PreviewRow): PreviewState {
  if (row.links.length > 0) return "live"
  if (isBuilding(row)) return "building"
  if (row.deploy?.checked) return "requested"
  if (row.deploy) return "deployable"
  return "idle"
}

/** A build is under way: the bot says so in the cell, or has an hourglass where the time goes. */
export function isBuilding(row: PreviewRow): boolean {
  return /build/i.test(row.status ?? "") || Boolean(row.built?.label.includes("⏳"))
}

/** Whether a row is waiting on something worth checking again soon. */
export function isPending(row: PreviewRow): boolean {
  return isBuilding(row) || previewState(row) === "requested"
}

/** The Actions run behind the build cell, when it links one. */
export function runIdOf(row: PreviewRow): string | null {
  return /\/actions\/runs\/(\d+)/.exec(row.built?.url ?? "")?.[1] ?? null
}

/**
 * `body` with the row's deploy item ticked, or null when that item is no
 * longer there unticked — the bot rewrote it, or someone got there first.
 * Only that one line changes: the bot rewrites this comment as it works,
 * and anything else taken from an older copy would undo its edits.
 */
export function tickDeployTask(body: string, line: string): string | null {
  if (!/\[ \]/.test(line)) return null
  const lines = body.split("\n")
  const index = lines.findIndex((each) => each.replace(/\r$/, "") === line)
  if (index < 0) return null
  lines[index] = lines[index]!.replace("[ ]", "[x]")
  return lines.join("\n")
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
  if (config.hosts.some((pattern) => hostMatches(url, pattern))) return true
  // GitHub's own pages carry the number because they are the PR — its
  // files, its diff anchors — and a bot's table of TODOs links those.
  if (hostOf(url) === "github.com") return false
  return config.matchPrNumber && new RegExp(`(^|[^0-9])${prNumber}([^0-9]|$)`).test(url)
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
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/[*_`]/g, "")
    .replace(/<[^>]+>/g, "")
    .trim()
}

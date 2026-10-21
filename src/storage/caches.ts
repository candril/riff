import { join } from "path"
import { mkdir } from "fs/promises"
import { mkdirSync, writeFileSync } from "fs"
import type { FileReviewStatus } from "../types"
import type { VisitWatermark } from "../utils/visit"
import type { Mark } from "../features/marks/types"
import { isMarkLetter } from "../features/marks/store"
import { localStorageDir, sourceToDir } from "./resolve"

const VIEWED_FILE = "viewed.json"
const VISIT_FILE = "visit.json"
const MARKS_FILE = "marks.json"
const PANELS_FILE = "panels.json"
const MENTIONABLE_FILE = "mentionable-users.json"

/** How long a cached mentionable-user roster stays fresh. */
const MENTIONABLE_TTL_MS = 24 * 60 * 60 * 1000

interface MentionableCache {
  [ownerRepo: string]: { fetchedAt: string; logins: string[] }
}

async function readMentionableCache(): Promise<MentionableCache> {
  const file = Bun.file(join(localStorageDir(), MENTIONABLE_FILE))
  if (!(await file.exists())) return {}
  try {
    const data = (await file.json()) as MentionableCache
    return data && typeof data === "object" ? data : {}
  } catch {
    return {}
  }
}

/**
 * Cached @mention candidates for a repo, or null when absent or older than
 * MENTIONABLE_TTL_MS. Stale entries are treated as missing so the caller
 * refetches; contributors trickle in slowly enough that a day-old list is
 * still a fine thing to show while the refetch runs.
 */
export async function loadMentionableUsers(
  owner: string,
  repo: string
): Promise<{ logins: string[]; stale: boolean } | null> {
  const cache = await readMentionableCache()
  const entry = cache[`${owner}/${repo}`]
  if (!entry || !Array.isArray(entry.logins)) return null

  const age = Date.now() - new Date(entry.fetchedAt).getTime()
  return { logins: entry.logins, stale: !(age >= 0 && age < MENTIONABLE_TTL_MS) }
}

/**
 * Cache @mention candidates for a repo. Keyed by owner/repo because riff can
 * open a PR from a different repo than the checkout it runs in.
 */
export async function saveMentionableUsers(
  owner: string,
  repo: string,
  logins: string[]
): Promise<void> {
  const cache = await readMentionableCache()
  cache[`${owner}/${repo}`] = { fetchedAt: new Date().toISOString(), logins }

  await mkdir(localStorageDir(), { recursive: true })
  await Bun.write(join(localStorageDir(), MENTIONABLE_FILE), JSON.stringify(cache, null, 2))
}

function getViewedFilePath(source: string): string {
  return join(localStorageDir(), sourceToDir(source), VIEWED_FILE)
}

function getVisitFilePath(source: string): string {
  return join(localStorageDir(), sourceToDir(source), VISIT_FILE)
}

/**
 * When this PR was last open, and what had been read by then (spec 069).
 * Missing on a first visit, which is not the same as "nothing is new" —
 * callers treat a null watermark as "there is nothing to compare against".
 */
export async function loadVisit(source: string): Promise<VisitWatermark | null> {
  const file = Bun.file(getVisitFilePath(source))
  if (!(await file.exists())) return null

  try {
    const data = (await file.json()) as Partial<VisitWatermark>
    if (typeof data.lastVisitAt !== "string") return null
    return {
      lastVisitAt: data.lastVisitAt,
      lastSeenHeadSha: typeof data.lastSeenHeadSha === "string" ? data.lastSeenHeadSha : "",
      seenCommentIds: Array.isArray(data.seenCommentIds)
        ? data.seenCommentIds.filter((id): id is string => typeof id === "string")
        : [],
    }
  } catch {
    return null
  }
}

export async function saveVisit(source: string, visit: VisitWatermark): Promise<void> {
  await mkdir(join(localStorageDir(), sourceToDir(source)), { recursive: true })
  await Bun.write(getVisitFilePath(source), JSON.stringify(visit, null, 2))
}

/**
 * The same write, synchronously — riff calls `process.exit` the moment it
 * has torn the renderer down, and an awaited write never gets to flush.
 */
export function saveVisitSync(source: string, visit: VisitWatermark): void {
  try {
    mkdirSync(join(localStorageDir(), sourceToDir(source)), { recursive: true })
    writeFileSync(getVisitFilePath(source), JSON.stringify(visit, null, 2))
  } catch {
    // A watermark that cannot be written is not worth failing the exit over.
  }
}

function getMarksFilePath(source: string): string {
  return join(localStorageDir(), sourceToDir(source), MARKS_FILE)
}

/**
 * The review's marks (spec 101). Never throws: a mark file that is missing
 * or mangled costs the reader their marks, not the review. Entries that do
 * not describe a mark are dropped one by one, and a letter written twice
 * keeps its last place, as setting it twice would.
 */
export async function loadMarks(source: string): Promise<Mark[]> {
  try {
    const file = Bun.file(getMarksFilePath(source))
    if (!(await file.exists())) return []
    const data: unknown = await file.json()
    if (!Array.isArray(data)) return []

    const byLetter = new Map<string, Mark>()
    for (const entry of data) {
      const mark = toMark(entry)
      if (!mark) continue
      byLetter.delete(mark.letter)
      byLetter.set(mark.letter, mark)
    }
    return [...byLetter.values()]
  } catch {
    return []
  }
}

function toMark(entry: unknown): Mark | null {
  if (typeof entry !== "object" || entry === null) return null
  const { letter, filename, line, side, text, head } = entry as Record<string, unknown>
  if (typeof letter !== "string" || !isMarkLetter(letter)) return null
  if (typeof filename !== "string") return null
  if (line !== null && !(typeof line === "number" && Number.isInteger(line) && line > 0)) return null
  if (side !== "LEFT" && side !== "RIGHT") return null
  // Only what following the line needs: a mark without them still resolves by number.
  return {
    letter,
    filename,
    line,
    side,
    ...(typeof text === "string" ? { text } : {}),
    ...(typeof head === "string" ? { head } : {}),
  }
}

export async function saveMarks(source: string, marks: readonly Mark[]): Promise<void> {
  await mkdir(join(localStorageDir(), sourceToDir(source)), { recursive: true })
  await Bun.write(getMarksFilePath(source), JSON.stringify(marks, null, 2))
}

/** What the panels hide, per review: the reader narrows one review, not every review in the repo. */
export interface PanelFilters {
  openThreadsOnly: boolean
  unviewedFilesOnly: boolean
}

function getPanelsFilePath(source: string): string {
  return join(localStorageDir(), sourceToDir(source), PANELS_FILE)
}

/** Never throws: a missing or mangled file shows everything, which is never wrong, only wider. */
export async function loadPanelFilters(source: string): Promise<PanelFilters> {
  try {
    const file = Bun.file(getPanelsFilePath(source))
    if (!(await file.exists())) return { openThreadsOnly: false, unviewedFilesOnly: false }
    const data: unknown = await file.json()
    const fields = typeof data === "object" && data !== null ? data as Record<string, unknown> : {}
    return {
      openThreadsOnly: fields.openThreadsOnly === true,
      unviewedFilesOnly: fields.unviewedFilesOnly === true,
    }
  } catch {
    return { openThreadsOnly: false, unviewedFilesOnly: false }
  }
}

export async function savePanelFilters(source: string, filters: PanelFilters): Promise<void> {
  await mkdir(join(localStorageDir(), sourceToDir(source)), { recursive: true })
  await Bun.write(getPanelsFilePath(source), JSON.stringify(filters, null, 2))
}

/** The last update queued per panels file, so each read-merge-write starts after the one before it ends. */
const panelFilterWrites = new Map<string, Promise<void>>()

/**
 * Writes one filter and keeps the rest as the file has them, so each panel
 * owns only its own field. Two fast toggles would otherwise both read the
 * old file, and the slower write could leave the earlier value behind.
 */
export function updatePanelFilters(source: string, patch: Partial<PanelFilters>): Promise<void> {
  const path = getPanelsFilePath(source)
  const previous = panelFilterWrites.get(path) ?? Promise.resolve()
  const write = previous
    .catch(() => {})
    .then(async () => savePanelFilters(source, { ...(await loadPanelFilters(source)), ...patch }))
  panelFilterWrites.set(path, write)
  void write.finally(() => {
    if (panelFilterWrites.get(path) === write) panelFilterWrites.delete(path)
  }).catch(() => {})
  return write
}

export async function loadViewedStatuses(source: string): Promise<FileReviewStatus[]> {
  const filepath = getViewedFilePath(source)
  const file = Bun.file(filepath)

  if (!(await file.exists())) {
    return []
  }

  try {
    const data = await file.json() as FileReviewStatus[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

async function saveViewedStatuses(
  source: string,
  statuses: Map<string, FileReviewStatus>
): Promise<void> {
  const dirPath = join(localStorageDir(), sourceToDir(source))
  await mkdir(dirPath, { recursive: true })

  const filepath = getViewedFilePath(source)
  const data = Array.from(statuses.values())

  await Bun.write(filepath, JSON.stringify(data, null, 2))
}

export async function saveFileViewedStatus(
  source: string,
  status: FileReviewStatus
): Promise<void> {
  const existing = await loadViewedStatuses(source)
  const statuses = new Map<string, FileReviewStatus>()

  for (const s of existing) {
    statuses.set(s.filename, s)
  }
  statuses.set(status.filename, status)

  await saveViewedStatuses(source, statuses)
}

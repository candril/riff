import { join } from "path"
import { mkdir } from "fs/promises"
import type { PRInfoPanelSection } from "../state"
import { ALL_SECTIONS } from "../components/pr-info-items"
import { localStorageDir, sourceToDir } from "./resolve"

const INFO_PANEL_FILE = "info-panel.json"

function reviewDir(source: string): string {
  return join(localStorageDir(), sourceToDir(source))
}

function infoPanelPath(source: string): string {
  return join(reviewDir(source), INFO_PANEL_FILE)
}

/**
 * The info panel sections the reader opened in this review. Never throws:
 * a missing or mangled file, or a name riff no longer knows, leaves that
 * section folded, which is never wrong, only one key away.
 */
export async function loadInfoSections(source: string): Promise<Set<PRInfoPanelSection>> {
  try {
    const file = Bun.file(infoPanelPath(source))
    if (!(await file.exists())) return new Set()
    const data: unknown = await file.json()
    const listed = typeof data === "object" && data !== null ? (data as Record<string, unknown>).openSections : undefined
    if (!Array.isArray(listed)) return new Set()
    return new Set(ALL_SECTIONS.filter((section) => listed.includes(section)))
  } catch {
    return new Set()
  }
}

/** The last write queued per file, so two quick folds land in the order they were made. */
const writes = new Map<string, Promise<void>>()

export function saveInfoSections(source: string, sections: ReadonlySet<PRInfoPanelSection>): Promise<void> {
  const path = infoPanelPath(source)
  const openSections = ALL_SECTIONS.filter((section) => sections.has(section))
  const previous = writes.get(path) ?? Promise.resolve()
  const write = previous
    .catch(() => {})
    .then(async () => {
      await mkdir(reviewDir(source), { recursive: true })
      await Bun.write(path, JSON.stringify({ openSections }, null, 2))
    })
  writes.set(path, write)
  void write.finally(() => {
    if (writes.get(path) === write) writes.delete(path)
  }).catch(() => {})
  return write
}

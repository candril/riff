import { homedir } from "os"
import { dirname, join } from "path"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs"
import { parseCounts, type UsageCounts } from "../features/usage/counts"

/** Global rather than per review: the question it answers is which of riff's actions get used at all. */
export const USAGE_PATH = join(homedir(), ".riff", "usage.json")

export function loadUsage(path: string = USAGE_PATH): UsageCounts | null {
  if (!existsSync(path)) return null
  try {
    return parseCounts(JSON.parse(readFileSync(path, "utf8")))
  } catch {
    return null
  }
}

/** Synchronous, so the save on process exit lands; renamed into place so a second riff never reads half a file. */
export function saveUsage(counts: UsageCounts, path: string = USAGE_PATH): void {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(counts, null, 2))
  renameSync(temp, path)
}

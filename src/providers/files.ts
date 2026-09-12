import { $ } from "bun"
import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative, sep } from "node:path"

/** Files read in one go before riff stops and says how many it left. */
export const MAX_FILES = 2000

/** Bytes of one file riff will draw before calling it unreadable. */
export const MAX_FILE_BYTES = 512 * 1024

/** Directories the fallback walk never descends into. */
const NEVER_WALK = new Set([".git", ".jj", "node_modules"])

export interface FilesTarget {
  /** What the user asked for, relative to the repo root. */
  path: string
  /** True when the path is a directory and every file under it is opened. */
  directory: boolean
}

export interface FilesDiff {
  diff: string
  /** Every file riff opened, in the order they appear in the diff. */
  filenames: string[]
  /** Files found past `MAX_FILES`, none of which were opened. */
  omitted: number
  /** Set when the file list came from riff's own walk rather than ripgrep. */
  fallbackReason: string | null
}

let ripgrepProbe: Promise<boolean> | null = null

/**
 * Whether ripgrep is on the PATH.
 *
 * Memoized for the same reason `detectVcs` is: every entry point asks, and
 * the answer costs a process spawn that cannot change under a running
 * session. Specs 087 and 088 ask the same question — this is the one place
 * that answers it.
 */
export function hasRipgrep(): Promise<boolean> {
  ripgrepProbe ??= probeRipgrep()
  return ripgrepProbe
}

export function resetRipgrepProbe(): void {
  ripgrepProbe = null
}

async function probeRipgrep(): Promise<boolean> {
  try {
    const result = await $`rg --version`.quiet().nothrow()
    return result.exitCode === 0
  } catch {
    return false
  }
}

/**
 * Every file under `root`, ignore-aware, relative to the process's cwd.
 *
 * ripgrep's walk is the one riff would otherwise have to write — it reads
 * `.gitignore` and every nested one, and it answers a monorepo instantly.
 * The fallback exists so a machine without it still opens a repository; it
 * knows nothing of `.gitignore` and says so through `fallbackReason`.
 */
export async function listFiles(
  root: string,
  ignores: (path: string) => boolean = () => false
): Promise<{ files: string[]; fallbackReason: string | null }> {
  if (await hasRipgrep()) {
    const result = await $`rg --files ${root}`.quiet().nothrow()
    if (result.exitCode === 0 || result.exitCode === 1) {
      const files = result
        .text()
        .split("\n")
        .filter((line) => line.length > 0 && !ignores(line))
      return { files: files.sort(), fallbackReason: null }
    }
  }

  const walked: string[] = []
  await walk(root, walked, ignores)
  return {
    files: walked.sort(),
    fallbackReason: "ripgrep is not on the PATH — riff walked the tree itself, ignoring nothing",
  }
}

async function walk(dir: string, into: string[], ignores: (path: string) => boolean): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    // A directory riff cannot read is a directory riff leaves alone.
    return
  }

  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (NEVER_WALK.has(entry.name)) continue
      await walk(path, into, ignores)
    } else if (entry.isFile() && !ignores(path)) {
      into.push(path)
    }
  }
}

/**
 * One file as a unified diff in which nothing changed.
 *
 * The whole file is a single hunk of context lines, numbered identically on
 * both sides, so `parseDiff` and everything after it sees the shape it
 * always sees. `null` for a file riff will not draw as text.
 */
export function fileAsDiff(path: string, contents: string): string {
  const lines = contents.split("\n")
  // A trailing newline splits into a final empty string that is not a line
  // of the file; a file that genuinely ends without one has no such entry.
  const trailingNewline = lines.length > 1 && lines[lines.length - 1] === ""
  if (trailingNewline) lines.pop()

  const body = lines.map((line) => " " + line)
  if (!trailingNewline && lines.length > 0) body.push("\\ No newline at end of file")

  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${lines.length} +1,${lines.length} @@`,
    ...body,
    "",
  ].join("\n")
}

/**
 * The placeholder a file riff will not draw opens as: one context line
 * saying which file it was and why, so the tree still lists it and the
 * cursor can still land on it.
 */
export function unreadableAsDiff(path: string, reason: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,1 +1,1 @@`,
    ` ${reason}`,
    "",
  ].join("\n")
}

/**
 * Read `target` and produce the diff string the rest of riff loads from.
 */
export async function buildFilesDiff(
  target: FilesTarget,
  ignores: (path: string) => boolean = () => false
): Promise<FilesDiff> {
  const { files, fallbackReason } = target.directory
    ? await listFiles(target.path, ignores)
    : { files: [target.path], fallbackReason: null }

  const opened = files.slice(0, MAX_FILES)
  const parts: string[] = []
  const filenames: string[] = []

  for (const file of opened) {
    const name = normalize(file)
    parts.push(await readAsDiff(file, name))
    filenames.push(name)
  }

  return {
    diff: parts.join(""),
    filenames,
    omitted: files.length - opened.length,
    fallbackReason,
  }
}

async function readAsDiff(path: string, name: string): Promise<string> {
  try {
    const info = await stat(path)
    if (info.size > MAX_FILE_BYTES) {
      return unreadableAsDiff(name, `${name} is ${Math.round(info.size / 1024)} KB — too large to draw`)
    }

    const bytes = await readFile(path)
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return fileAsDiff(name, text)
  } catch (err) {
    if (err instanceof TypeError) return unreadableAsDiff(name, `${name} is not text`)
    return unreadableAsDiff(name, `${name} could not be read`)
  }
}

/**
 * A path as the tree and the comment store want it: relative to the cwd,
 * forward slashes, no leading `./`.
 */
function normalize(path: string): string {
  const rel = path.startsWith(sep) ? relative(process.cwd(), path) : path
  return rel.split(sep).join("/").replace(/^\.\//, "")
}

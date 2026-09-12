import { $ } from "bun"
import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative, sep } from "node:path"

/** Files listed before riff stops and says how many it left. Only names are
 *  listed here — the file you are on is the one that gets read — so the
 *  ceiling is what the tree can hold, not what the disk can take. */
export const MAX_FILES = 10000

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
  /** Every listed file as a diff header with no hunk: a name, and nothing
   *  read. The open file's content is spliced in when it is opened. */
  diff: string
  /** Every file riff opened, in the order they appear in the diff. */
  filenames: string[]
  /** The file the path named, when it named one. riff opens on it. */
  selected: string | null
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
 * A listed but unopened file: a name the tree can show and the cursor can
 * reach, with no hunk, so it costs a line of string and no read at all.
 */
export function stubAsDiff(path: string): string {
  return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, ""].join("\n")
}

/**
 * List `target` and produce the diff string the rest of riff loads from.
 *
 * Nothing is read here. riff opens on one file and the reader moves between
 * them one at a time, so one at a time is what riff reads — `riff .` on a
 * few thousand files is then a list, not seconds of disk.
 */
export async function buildFilesDiff(
  target: FilesTarget,
  ignores: (path: string) => boolean = () => false
): Promise<FilesDiff> {
  // A file names where to open, not what to list. Listing only it would
  // hand you a tree of one and no way to reach the file beside it, so the
  // scope is the repository and the file is where riff starts.
  const scope = target.directory ? target.path : "."
  const { files, fallbackReason } = await listFiles(scope, ignores)
  const selected = target.directory ? null : normalize(target.path)

  // The file that was asked for is opened even past the ceiling, because
  // riff was pointed at it.
  const capped = files.slice(0, MAX_FILES)
  const listed =
    selected && !capped.some((file) => normalize(file) === selected)
      ? [...capped, target.path]
      : capped

  const filenames = listed.map(normalize)

  return {
    diff: filenames.map(stubAsDiff).join(""),
    filenames,
    selected,
    omitted: Math.max(0, files.length - listed.length),
    fallbackReason,
  }
}

/**
 * One file's content as the diff that stands in for it — read when the file
 * is opened. A file riff will not draw says which it was on the one line it
 * opens as.
 */
export async function openFileAsDiff(name: string): Promise<string> {
  try {
    const info = await stat(name)
    if (info.size > MAX_FILE_BYTES) {
      return unreadableAsDiff(name, `${name} is ${Math.round(info.size / 1024)} KB — too large to draw`)
    }

    const bytes = await readFile(name)
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

/**
 * `riff comments …` — local review comments from the command line (spec 049).
 *
 * The TUI is where comments get written; this is how something else acts on
 * them afterwards — a Claude Code session working through a local review,
 * or the user tidying up. Everything here touches only `.riff/` on disk and
 * never GitHub: `resolve` marks a thread done (a resolved local thread is
 * never published), `remove` deletes the file, `clear` deletes every local
 * one. Synced comments are GitHub's and are left alone.
 *
 *   riff comments add --file <path> --line <n> [--end-line <m>] [--target <t>]
 *   riff comments [list] [--json] [--path <p>] [<target>]
 *   riff comments edit <id> [<target>]
 *   riff comments resolve <id> [<target>]
 *   riff comments unresolve <id> [<target>]
 *   riff comments remove <id> [<target>]
 *   riff comments clear [<target>]
 *   riff comments install-skill [--global]
 *
 * `<target>` is the same argument `riff` itself takes (nothing, a revision,
 * a PR number, `gh:owner/repo#N`) and selects which comment set to operate
 * on. `<id>` accepts the full id or the 8-character prefix the files are
 * named by.
 */

import { join, relative, resolve, isAbsolute, sep } from "node:path"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import type { Comment } from "../types"
import { createComment } from "../types"
import {
  loadComments,
  saveComment,
  deleteCommentFile,
  clearLocalComments,
  commentFilePath,
  findRepoRoot,
} from "../storage"
import { installSkill } from "./skill"

export interface CommentsCliOptions {
  /** Resolve `<target>` to the storage source id (`local`, `HEAD~3`, `gh:o/r#1`). */
  resolveSource: (target: string | undefined) => Promise<string>
}

export async function runCommentsCli(argv: string[], opts: CommentsCliOptions): Promise<number> {
  const json = argv.includes("--json")
  const words = positional(argv)
  const verb = words[0] && VERBS.has(words[0]) ? words[0] : "list"
  const rest = verb === "list" && words[0] !== "list" ? words : words.slice(1)

  if (verb === "add") return add(argv, opts, json)

  if (verb === "install-skill") {
    const path = installSkill(argv.includes("--global"))
    console.log(`Installed ${path}`)
    console.log("In a Claude Code session here, ask it to look at the riff comments.")
    return 0
  }

  const needsId =
    verb === "resolve" || verb === "unresolve" || verb === "remove" || verb === "edit"
  const id = needsId ? rest[0] : undefined
  const target = needsId ? rest[1] : rest[0]
  if (needsId && !id) {
    console.error(`riff comments ${verb}: missing <id>`)
    return 2
  }

  const source = await opts.resolveSource(target)
  const comments = await loadComments(source)

  switch (verb) {
    case "list":
      return list(underPath(comments, flag(argv, "path")), source, json)
    case "clear": {
      const n = await clearLocalComments(source)
      console.log(json ? JSON.stringify({ removed: n }) : `Removed ${n} local comment${n === 1 ? "" : "s"}`)
      return 0
    }
    case "remove": {
      const found = findLocal(comments, id!)
      if (!found) return notFound(id!)
      await deleteCommentFile(found.id, source)
      console.log(json ? JSON.stringify({ removed: found.id }) : `Removed ${label(found)}`)
      return 0
    }
    case "edit": {
      const found = findLocal(comments, id!)
      if (!found) return notFound(id!)

      const body = (flag(argv, "body") ?? (await readStdin())).trim()
      if (!body) {
        console.error("riff comments edit: the comment is empty")
        return 2
      }

      // The body changes; the anchor does not. Rewriting where a comment
      // points because its text was rewritten would move it off the line
      // someone was talking about.
      await saveComment({ ...found, body }, source)
      console.log(json ? JSON.stringify({ id: found.id.slice(0, 8) }) : `Edited ${label(found)}`)
      return 0
    }
    case "resolve":
    case "unresolve": {
      const found = findLocal(comments, id!)
      if (!found) return notFound(id!)
      const root = found.inReplyTo ? (comments.find((c) => c.id === found.inReplyTo) ?? found) : found
      const resolved = verb === "resolve"
      await saveComment({ ...root, isThreadResolved: resolved }, source)
      console.log(
        json ? JSON.stringify({ id: root.id, resolved }) : `${resolved ? "Resolved" : "Reopened"} ${label(root)}`,
      )
      return 0
    }
  }
  return 2
}

const VERBS = new Set(["list", "add", "edit", "resolve", "unresolve", "remove", "clear", "install-skill"])

/** Flags that take the word after them, so it is not a `<target>`. */
const VALUED_FLAGS = new Set(["--path", "--file", "--line", "--end-line", "--body", "--target"])

/**
 * The words that are arguments rather than flags or flag values.
 *
 * Without the second half, `riff comments --path src` read `src` as the
 * target and reported on a source nobody asked for.
 */
export function positional(argv: string[]): string[] {
  const words: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i]!
    if (VALUED_FLAGS.has(word)) {
      i++
      continue
    }
    if (!word.startsWith("-")) words.push(word)
  }
  return words
}

/**
 * The comments under a path — a file, or a directory and everything in it.
 *
 * `.riff/` is one repository's worth of comments, and an agent is usually
 * being handed one corner of it.
 */
export function underPath(comments: Comment[], path: string | undefined): Comment[] {
  if (!path) return comments
  const prefix = path.replace(/^\.\//, "").replace(/\/+$/, "")
  if (prefix === "" || prefix === ".") return comments
  return comments.filter(
    (c) => c.filename === prefix || c.filename.startsWith(prefix + "/"),
  )
}

/** `--file x` / `--file=x`, or undefined. */
function flag(argv: string[], name: string): string | undefined {
  const exact = argv.indexOf(`--${name}`)
  if (exact !== -1) return argv[exact + 1]
  const joined = argv.find((a) => a.startsWith(`--${name}=`))
  return joined?.slice(name.length + 3)
}

/** Everything on stdin, or "" when nothing is piped in. */
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ""
  const chunks: Uint8Array[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Uint8Array)
  return Buffer.concat(chunks).toString("utf-8")
}

/**
 * What says the line moved: the anchored line as it read when the comment
 * was written, hashed. Trimmed first, so reindenting a block does not
 * invalidate every note in it (spec 083).
 */
export function hashLine(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 16)
}

/**
 * Write a comment from outside riff — an editor, a script (spec 091).
 *
 * It is always a note. The writer has no diff in view and cannot know
 * whether GitHub could anchor the line, so riff answers the honest way: a
 * comment written here never leaves the machine, and `riff comments --json`
 * hands it to an agent like any other.
 *
 * riff owns the format. That is the whole reason this verb exists rather
 * than a plugin writing `.riff/` itself: which directory a comment belongs
 * in is six rules deep (`resolveStorageDir`), and a second implementation
 * would write where riff does not read.
 */
async function add(argv: string[], opts: CommentsCliOptions, json: boolean): Promise<number> {
  const file = flag(argv, "file")
  const rawLine = flag(argv, "line")
  if (!file || !rawLine) {
    console.error("riff comments add: --file <path> and --line <n> are required")
    return 2
  }

  const line = Number.parseInt(rawLine, 10)
  const endLine = flag(argv, "end-line") ? Number.parseInt(flag(argv, "end-line")!, 10) : undefined
  if (!Number.isFinite(line) || line < 1) {
    console.error(`riff comments add: --line must be a line number, got ${rawLine}`)
    return 2
  }

  const body = (flag(argv, "body") ?? (await readStdin())).trim()
  if (!body) {
    console.error("riff comments add: the comment is empty")
    return 2
  }

  const root = (await findRepoRoot()) ?? process.cwd()
  const absolute = isAbsolute(file) ? file : resolve(process.cwd(), file)
  // Stored the way riff stores every filename: relative to the repo root,
  // so a comment written from a subdirectory anchors where riff looks.
  const filename = relative(root, absolute).split(sep).join("/")

  const text = await readFile(absolute, "utf-8").catch(() => null)
  if (text === null) {
    console.error(`riff comments add: cannot read ${file}`)
    return 2
  }
  const lines = text.split("\n")
  if (line > lines.length) {
    console.error(`riff comments add: ${filename} has ${lines.length} lines, not ${line}`)
    return 2
  }

  const source = await opts.resolveSource(flag(argv, "target"))
  const comment: Comment = {
    ...createComment(filename, line, body, "RIGHT"),
    kind: "note",
    anchorHash: hashLine(lines[line - 1] ?? ""),
    startLine: endLine !== undefined && endLine < line ? endLine : undefined,
  }
  await saveComment(comment, source)

  const id = comment.id.slice(0, 8)
  console.log(json ? JSON.stringify({ id, file: filename, line }) : `${id}  ${filename}:${line}`)
  return 0
}

async function list(comments: Comment[], source: string, json: boolean): Promise<number> {
  const local = comments.filter((c) => c.status === "local")
  if (json) {
    console.log(JSON.stringify(await buildReport(local, comments, source), null, 2))
    return 0
  }
  if (local.length === 0) {
    console.log(`No local comments for ${source}`)
    return 0
  }
  for (const c of local) {
    const done = rootOf(c, comments).isThreadResolved ? " [resolved]" : ""
    const note = c.kind === "note" ? " [note]" : ""
    const reply = c.inReplyTo ? "  ↳ " : ""
    console.log(`${c.id.slice(0, 8)}  ${reply}${c.filename}:${c.line}${note}${done}`)
    for (const line of c.body.split("\n")) console.log(`          ${line}`)
  }
  return 0
}

/** Lines of context shown either side of a comment's anchor. */
const CONTEXT_RADIUS = 4

/** How far from its old line a note is looked for before it is called lost. */
const DRIFT_WINDOW = 50

/**
 * Where a note's line went (spec 086).
 *
 * A review comment is pinned to a commit and GitHub outdates it. A note is
 * pinned to a line of a worktree that keeps being edited, and nothing
 * watches it — so one line inserted above turns it into a note about the
 * wrong code, silently. The hash written with the comment is what says
 * otherwise: still there, moved to a line riff can name, or gone.
 */
export function driftOf(
  comment: Comment,
  lines: string[] | null,
): { at: number; moved: boolean } | { at: null; moved: false } | null {
  if (!comment.anchorHash || !lines) return null

  const here = lines[comment.line - 1]
  if (here !== undefined && hashLine(here) === comment.anchorHash) {
    return { at: comment.line, moved: false }
  }

  // Outwards from where it was, so the nearest match wins when a line
  // repeats — which in code it very often does.
  for (let offset = 1; offset <= DRIFT_WINDOW; offset++) {
    for (const candidate of [comment.line - offset, comment.line + offset]) {
      const text = lines[candidate - 1]
      if (text !== undefined && hashLine(text) === comment.anchorHash) {
        return { at: candidate, moved: true }
      }
    }
  }

  return { at: null, moved: false }
}

/**
 * Everything an agent needs to act on a review without going looking: threads
 * rather than loose comments, the anchored code as it stands in the worktree,
 * and the command that retires each one. Reading the anchors costs one file
 * read per commented file, which is cheaper than the agent grepping for them.
 */
async function buildReport(local: Comment[], all: Comment[], source: string) {
  const root = (await findRepoRoot()) ?? process.cwd()
  const roots = local.filter((c) => !c.inReplyTo)
  const fileCache = new Map<string, string[] | null>()

  const threads = await Promise.all(
    roots.map(async (c) => {
      const anchor = await anchorFor(c, root, fileCache)
      const drift = driftOf(c, fileCache.get(c.filename) ?? null)
      const id = c.id.slice(0, 8)
      return {
        id,
        file: c.filename,
        line: c.line,
        side: c.side,
        // A note is a comment on a line, not on a change: it was written
        // where GitHub has no anchor, it is never published, and the work
        // it asks for is the same work (spec 085).
        kind: c.kind ?? "review",
        resolved: c.isThreadResolved === true,
        // Absent when riff has nothing to compare against — a comment from
        // before the hash, or a file it cannot read.
        anchor:
          drift === null
            ? null
            : drift.at === null
              ? { state: "lost", line: null }
              : { state: drift.moved ? "moved" : "here", line: drift.at },
        createdAt: c.createdAt,
        body: c.body,
        ...anchor,
        replies: local
          .filter((r) => r.inReplyTo === c.id)
          .map((r) => ({ id: r.id.slice(0, 8), createdAt: r.createdAt, body: r.body })),
        diffHunk: c.diffHunk ?? null,
        commentFile: await commentFilePath(c.id, source),
        resolve: `riff comments resolve ${id}`,
        remove: `riff comments remove ${id}`,
      }
    }),
  )

  const open = threads.filter((t) => !t.resolved)
  return {
    source,
    root,
    counts: { threads: threads.length, open: open.length, resolved: threads.length - open.length },
    syncedComments: all.length - local.length,
    threads,
  }
}

/**
 * The commented line as it reads in the working copy right now, with its
 * neighbours. Only for RIGHT-side anchors: a LEFT-side comment points at a
 * line that was deleted, so the worktree can't show it — `diffHunk` is the
 * record there. Missing files (deleted since, or a diff of another revision)
 * simply carry no anchor.
 */
async function anchorFor(
  c: Comment,
  root: string,
  cache: Map<string, string[] | null>,
): Promise<{ code: string | null; context: string[] | null }> {
  if (c.side !== "RIGHT") return { code: null, context: null }

  let lines = cache.get(c.filename)
  if (lines === undefined) {
    lines = await readLines(join(root, c.filename))
    cache.set(c.filename, lines)
  }
  if (!lines || c.line < 1 || c.line > lines.length) return { code: null, context: null }

  const from = Math.max(1, c.line - CONTEXT_RADIUS)
  const to = Math.min(lines.length, c.line + CONTEXT_RADIUS)
  const context: string[] = []
  for (let n = from; n <= to; n++) {
    context.push(`${n === c.line ? ">" : " "} ${n}| ${lines[n - 1]}`)
  }
  return { code: lines[c.line - 1] ?? null, context }
}

async function readLines(path: string): Promise<string[] | null> {
  try {
    const file = Bun.file(path)
    if (!(await file.exists())) return null
    return (await file.text()).split("\n")
  } catch {
    return null
  }
}

function findLocal(comments: Comment[], id: string): Comment | undefined {
  return comments.find((c) => c.status === "local" && (c.id === id || c.id.startsWith(id)))
}

function rootOf(c: Comment, all: Comment[]): Comment {
  return c.inReplyTo ? (all.find((p) => p.id === c.inReplyTo) ?? c) : c
}

function label(c: Comment): string {
  return `${c.id.slice(0, 8)} (${c.filename}:${c.line})`
}

function notFound(id: string): number {
  console.error(`No local comment matching ${id}`)
  return 1
}


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
 *   riff comments [list] [--json] [<target>]
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

import { join } from "node:path"
import type { Comment } from "../types"
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
  const words = argv.filter((a) => !a.startsWith("-"))
  const verb = words[0] && VERBS.has(words[0]) ? words[0] : "list"
  const rest = verb === "list" && words[0] !== "list" ? words : words.slice(1)

  if (verb === "install-skill") {
    const path = installSkill(argv.includes("--global"))
    console.log(`Installed ${path}`)
    console.log("In a Claude Code session here, ask it to look at the riff comments.")
    return 0
  }

  const needsId = verb === "resolve" || verb === "unresolve" || verb === "remove"
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
      return list(comments, source, json)
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

const VERBS = new Set(["list", "resolve", "unresolve", "remove", "clear", "install-skill"])

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
    const reply = c.inReplyTo ? "  ↳ " : ""
    console.log(`${c.id.slice(0, 8)}  ${reply}${c.filename}:${c.line}${done}`)
    for (const line of c.body.split("\n")) console.log(`          ${line}`)
  }
  return 0
}

/** Lines of context shown either side of a comment's anchor. */
const CONTEXT_RADIUS = 4

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
      const id = c.id.slice(0, 8)
      return {
        id,
        file: c.filename,
        line: c.line,
        side: c.side,
        resolved: c.isThreadResolved === true,
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


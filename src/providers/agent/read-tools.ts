import type { Comment } from "../../types"
import { groupIntoThreads, type Thread } from "../../utils/threads"
import { describeFile, formatDiffLine, hunksOf, type Hunk } from "./hunks"
import { TREE_CUT_OFF, type ReviewSource, type Side } from "./review-source"

export const PAGE_LINES = 2000
export const READS_PER_ANSWER = 30

export interface ToolResult {
  text: string
  isError?: boolean
}

function page(lines: readonly string[], offset = 0): string {
  const shown = lines.slice(offset, offset + PAGE_LINES)
  const end = offset + shown.length
  const more =
    end < lines.length
      ? `\n[lines ${offset + 1}–${end} of ${lines.length}; call again with offset=${end} for more]`
      : ""
  return `${shown.join("\n")}${more}`
}

const hunkLines = (hunk: Hunk) => [hunk.header, ...hunk.lines.map(formatDiffLine)]

const firstLine = (text: string) => text.split("\n", 1)[0] ?? ""

const textOf = (comment: Comment) => comment.localEdit ?? comment.body

function placeOf(comment: Comment): string {
  const lines = comment.startLine ? `${comment.startLine}-${comment.line}` : String(comment.line)
  return `${comment.filename}:${lines}${comment.side === "LEFT" ? " (old)" : ""}`
}

function stateOf(thread: Thread): string {
  return `${thread.resolved ? "resolved" : "open"}${thread.outdated ? ", outdated" : ""}`
}

// What sets a comment apart from GitHub's copy of it, if anything.
function unsyncedOf(comment: Comment): string | null {
  const kind = comment.kind === "note" ? "note, " : ""
  if (comment.status !== "synced") return `${kind}${comment.status}`
  return comment.localEdit !== undefined ? `${kind}edited, not yet on GitHub` : null
}

function threadText(thread: Thread): string[] {
  const root = thread.comments[0]!
  const lines = [`Thread ${thread.id} on ${placeOf(root)} (${stateOf(thread)})`]
  for (const comment of thread.comments) {
    const unsynced = unsyncedOf(comment)
    const status = unsynced ? `, ${unsynced}` : ""
    lines.push(`--- ${comment.author ?? "you"}, ${comment.createdAt.slice(0, 10)}${status}`)
    lines.push(...textOf(comment).split("\n"))
  }
  return lines
}

export function createReadTools(source: ReviewSource, onReadFailed: (what: string) => void) {
  let reads = 0
  const fileAt = (path: string) => source.files().find((f) => f.filename === path)
  const prefixOf = (dir?: string) => (dir ? `${dir.replace(/\/$/, "")}/` : "")
  const threads = () => groupIntoThreads([...source.comments()])

  async function guarded(what: string, read: () => Promise<string> | string): Promise<ToolResult> {
    if (reads >= READS_PER_ANSWER) {
      return {
        text: `Read limit reached: ${READS_PER_ANSWER} reads per answer. Answer with what you have.`,
        isError: true,
      }
    }
    reads++
    try {
      return { text: await read() }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onReadFailed(`${what}: ${message}`)
      return { text: `Read failed: ${message}`, isError: true }
    }
  }

  return {
    startAnswer: () => {
      reads = 0
    },
    listFiles: (dir?: string, offset?: number) =>
      guarded(`list files${dir ? ` in ${dir}` : ""}`, () => {
        const prefix = prefixOf(dir)
        const hidden = source.hiddenPaths()
        const under = source.files().filter((f) => f.filename.startsWith(prefix))
        const shown = under.filter((f) => !hidden.has(f.filename))
        const left = under.length - shown.length
        if (under.length === 0) {
          return dir ? `No changed files under ${dir}.` : "No changed files."
        }
        const note = left
          ? `${left} more ${left === 1 ? "file" : "files"} hidden by the reviewer's ignore patterns; read_diff reads them by path.`
          : ""
        return [page(shown.map(describeFile), offset), note].filter(Boolean).join("\n")
      }),
    listHunks: (path: string) =>
      guarded(`hunks of ${path}`, () => {
        const file = fileAt(path)
        if (!file) {
          return `${path} is not a changed file.`
        }
        const hunks = hunksOf(file)
        return hunks.length === 0
          ? `${path}: no line changes (binary, or a rename or mode change alone).`
          : hunks.map((h, i) => `${i}: ${h.header}`).join("\n")
      }),
    readDiff: (path: string, hunk?: number, offset?: number) =>
      guarded(`diff of ${path}`, () => {
        const file = fileAt(path)
        if (!file) {
          return `${path} is not a changed file.`
        }
        const hunks = hunksOf(file)
        if (hunks.length === 0) {
          return `${path}: no line changes to show (binary, or a rename or mode change alone).`
        }
        if (hunk !== undefined && !hunks[hunk]) {
          return `${path} has no hunk ${hunk}; it has ${hunks.length}.`
        }
        const lines = hunk === undefined ? hunks.flatMap(hunkLines) : hunkLines(hunks[hunk]!)
        return page(lines, offset)
      }),
    readFile: (path: string, side: Side, offset?: number) =>
      guarded(`${path} at ${side}`, async () => {
        const text = await source.fileText(path, side)
        if (text.kind !== "text") {
          return `${path} at ${side}: ${text.kind === "missing" ? "does not exist" : "binary file"}.`
        }
        const numbered = text.text
          .replace(/\n$/, "")
          .split("\n")
          .map((line, i) => `${String(i + 1).padStart(5)} ${line}`)
        return page(numbered, offset)
      }),
    listTree: (dir?: string, offset?: number) =>
      guarded(`list tree${dir ? ` under ${dir}` : ""}`, async () => {
        const prefix = prefixOf(dir)
        const paths = (await source.tree()).filter((p) => p.startsWith(prefix) || p === TREE_CUT_OFF)
        return paths.some((p) => p !== TREE_CUT_OFF)
          ? page(paths, offset)
          : `No paths under ${dir ?? "the repository root"}.`
      }),
    listThreads: (offset?: number) =>
      guarded("list threads", () => {
        const all = threads()
        if (all.length === 0) {
          return "The review has no threads."
        }
        return page(
          all.map((t) => {
            const root = t.comments[0]!
            return `${t.id} ${placeOf(root)} (${stateOf(t)}) ${root.author ?? "you"}: ${firstLine(textOf(root))}`
          }),
          offset,
        )
      }),
    readThread: (id: string, offset?: number) =>
      guarded(`thread ${id}`, () => {
        const thread = threads().find((t) => t.id === id)
        return thread ? page(threadText(thread), offset) : `No thread ${id}; list_threads lists them.`
      }),
    listComments: (offset?: number) =>
      guarded("list comments", () => {
        const own = source.comments().filter((c) => unsyncedOf(c) !== null)
        if (own.length === 0) {
          return "The reviewer has no local, pending or edited comments."
        }
        return page(
          own.flatMap((c) => [`--- ${c.id} on ${placeOf(c)} (${unsyncedOf(c)})`, ...textOf(c).split("\n")]),
          offset,
        )
      }),
  }
}

export type ReadTools = ReturnType<typeof createReadTools>

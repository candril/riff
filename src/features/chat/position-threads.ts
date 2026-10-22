import type { Comment } from "../../types"
import type { Position } from "../../providers/agent/position"
import { threadText } from "../../providers/agent/thread-text"
import { groupIntoThreads, type Thread } from "../../utils/threads"
import { ATTACHMENT_LINES } from "./references"

const onWholeFile = (comment: Comment) => !(comment.line > 0)

/**
 * The threads a question asked at `position` is about: those on its line or
 * selection, on its side, or every thread of the file from the file's header.
 * A thread on the whole file belongs to no line, so only the header takes it.
 * A unified context row also takes the old side's threads on its old line,
 * whose dot its gutter draws.
 */
export function threadsAt(position: Position, comments: readonly Comment[]): Thread[] {
  const ofFile = groupIntoThreads([...comments]).filter((t) => t.comments[0]!.filename === position.path)
  const { side, line, selection } = position
  if (side === undefined && line === undefined && !selection) return ofFile

  const githubSide = (side ?? "new") === "old" ? "LEFT" : "RIGHT"
  const [from, to] = selection ? [selection.start, selection.end] : [line, line]
  if (from === undefined || to === undefined) return []
  const oldLine = selection ? undefined : position.oldLine
  const covers = (root: Comment, start: number, end: number) => (root.startLine ?? root.line) <= end && root.line >= start
  return ofFile.filter((thread) => {
    const root = thread.comments[0]!
    if (onWholeFile(root)) return false
    if (root.side === githubSide) return covers(root, from, to)
    return oldLine !== undefined && root.side === "LEFT" && covers(root, oldLine, oldLine)
  })
}

/**
 * The threads as `[Thread …]` blocks the agent receives with the question,
 * and the label the chat shows for them. Capped like an `@` reference, with
 * the threads that did not fit named for read_thread.
 */
export function threadAttachment(threads: Thread[]): { attachment: string; label: string } | null {
  if (threads.length === 0) return null
  const lines: string[] = []
  const starts: number[] = []
  for (const thread of threads) {
    const [header, ...rest] = threadText(thread)
    starts.push(lines.length)
    lines.push(`[${header}]`, ...rest)
  }
  const label = threads.length === 1 ? "1 thread" : `${threads.length} threads`
  if (lines.length <= ATTACHMENT_LINES) return { attachment: lines.join("\n"), label }

  const unread = threads.filter((_, i) => (starts[i + 1] ?? lines.length) > ATTACHMENT_LINES)
  const reads = unread.map((t) => `read_thread id=${t.id}`).join(", ")
  const footer = `[cut at ${ATTACHMENT_LINES} of ${lines.length} lines; ${reads} for the rest]`
  return { attachment: [...lines.slice(0, ATTACHMENT_LINES), footer].join("\n"), label }
}

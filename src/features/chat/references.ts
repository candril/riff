import type { DiffFile } from "../../utils/diff-parser"
import type { AgentFile } from "../../providers/agent/target"
import { fileDiffLines, formatDiffLine, hunksOf } from "../../providers/agent/hunks"
import type { Position } from "../../providers/agent/position"

export type Expanded = { attachments: string[]; labels: string[] } | { error: string }

export interface PrSummary {
  number: number
  title: string
  description: string
  files: readonly AgentFile[]
}

export interface ReferenceContext {
  files: readonly DiffFile[]
  position: Position | null
  // Null for a local diff, which has no pull request to describe.
  pr: PrSummary | null
}

export const ATTACHMENT_LINES = 400

const TOKEN = /(?:^|\s)@(\S+)/g
const SELECTION = new Set(["s", "selection"])
const TRAILING = /[.,;:!?)]+$/
// An @handle or @Inject is text; src/a.ts or a.ts names a file.
const looksLikePath = (token: string) => /[/.]/.test(token)

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1)
const range = ({ start, end }: { start: number; end: number }) => (start === end ? `${start}` : `${start}-${end}`)

function attachment(header: string, lines: readonly string[], rest: (shown: number) => string): string {
  if (lines.length <= ATTACHMENT_LINES) return [header, ...lines].join("\n")
  const footer = `[cut at ${ATTACHMENT_LINES} of ${lines.length} lines; ${rest(ATTACHMENT_LINES)} for the rest]`
  return [header, ...lines.slice(0, ATTACHMENT_LINES), footer].join("\n")
}

function fileAttachment(header: string, file: DiffFile): string {
  const lines = fileDiffLines(file)
  if (lines.length === 0) {
    return `${header}\n${file.filename}: no line changes (binary, or a rename or mode change alone).`
  }
  return attachment(header, lines, (shown) => `read_diff path=${file.filename} offset=${shown}`)
}

/**
 * The selected lines with their hunk headers. A unified selection runs
 * across the other side's lines between its ends, so those come along too:
 * the reviewer selected them, and the agent reads the change as one run.
 * Each line keeps where it sits in fileDiffLines, so a cut selection can
 * point read_diff at the rest.
 */
function selectionLines(file: DiffFile, side: "old" | "new", selection: { start: number; end: number }) {
  const lines: Array<{ text: string; at: number }> = []
  let at = 0
  for (const hunk of hunksOf(file)) {
    const header = at
    const numberOf = (i: number) => (side === "new" ? hunk.lines[i]!.newLine : hunk.lines[i]!.oldLine)
    const inside = hunk.lines
      .map((_, i) => i)
      .filter((i) => {
        const n = numberOf(i)
        return n !== undefined && n >= selection.start && n <= selection.end
      })
    if (inside.length > 0) {
      lines.push({ text: hunk.header, at: header })
      for (let i = inside[0]!; i <= inside.at(-1)!; i++) {
        lines.push({ text: formatDiffLine(hunk.lines[i]!), at: header + 1 + i })
      }
    }
    at += 1 + hunk.lines.length
  }
  return lines
}

function prLines(pr: PrSummary): { lines: string[]; firstFile: number } {
  const lines = [`#${pr.number} ${pr.title}`, ...(pr.description.trim() ? pr.description.split("\n") : ["(no description)"])]
  lines.push("", `Changed files (${pr.files.length}):`)
  const firstFile = lines.length
  for (const f of pr.files) lines.push(`${f.status} ${f.path} (+${f.additions} -${f.deletions})`)
  return { lines, firstFile }
}

/**
 * The `@` tokens of a question, as attachments the agent receives ahead of
 * it and labels the chat shows above it. A token that names nothing riff
 * knows stops the question instead of sending it without what was meant.
 */
export function expandReferences(text: string, ctx: ReferenceContext): Expanded {
  const attachments: string[] = []
  const labels: string[] = []
  const seen = new Set<string>()
  const add = (key: string, label: string, build: () => string) => {
    if (seen.has(key)) return
    seen.add(key)
    attachments.push(build())
    labels.push(label)
  }

  for (const match of text.matchAll(TOKEN)) {
    const token = match[1]!.replace(TRAILING, "")
    const position = ctx.position

    if (SELECTION.has(token)) {
      const file = position && ctx.files.find((f) => f.filename === position.path)
      if (!position?.selection || !file) {
        return { error: "@selection needs a visual selection in the diff; the question was not sent." }
      }
      const side = position.side ?? "new"
      const selection = position.selection
      const where = `${position.path}:${range(selection)}`
      add("selection", `@selection ${basename(position.path)}:${range(selection)}`, () => {
        const lines = selectionLines(file, side, selection)
        return attachment(
          `[@selection: ${where} (${side} side)]`,
          lines.map((l) => l.text),
          (shown) => `read_diff path=${file.filename} offset=${lines[shown]!.at}`,
        )
      })
      continue
    }

    if (token === "file") {
      const file = position && ctx.files.find((f) => f.filename === position.path)
      if (!file) {
        return { error: "@file needs the diff cursor on a file; the question was not sent." }
      }
      add(`file:${file.filename}`, `@file ${file.filename}`, () =>
        fileAttachment(`[@file: the diff of ${file.filename}]`, file),
      )
      continue
    }

    if (token === "pr") {
      const pr = ctx.pr
      if (!pr) return { error: "@pr needs a pull request review." }
      add("pr", `@pr #${pr.number}`, () => {
        const { lines, firstFile } = prLines(pr)
        return attachment(
          `[@pr: pull request #${pr.number}, its description and changed files]`,
          lines,
          (shown) => `list_files offset=${Math.max(0, shown - firstFile)}`,
        )
      })
      continue
    }

    const file = ctx.files.find((f) => f.filename === token)
    if (file) {
      add(`file:${file.filename}`, `@${file.filename}`, () => fileAttachment(`[@${file.filename}: its diff]`, file))
    } else if (looksLikePath(token)) {
      return { error: `@${token} is not a file of this change; the question was not sent.` }
    }
  }
  return { attachments, labels }
}

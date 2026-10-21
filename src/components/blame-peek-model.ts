import type { LineBlame } from "../providers/blame/source"
import type { BlameSide } from "../providers/blame/sides"
import { MAX_WIDTH, PADDING, type PeekModel, type PeekSegment, type Screen } from "./peek-model"
import { formatTimeAgo } from "./pr-info-format"

export interface BlamePeekTarget {
  path: string
  side: BlameSide
  line: number
}

export type BlamePeekStatus =
  | { status: "loading" }
  | { status: "ready"; result: LineBlame | null }
  | { status: "error"; message: string }

export type BlamePeekInput = { target: BlamePeekTarget; now: number } & BlamePeekStatus & Screen

const MIN_WIDTH = 48

const seg = (text: string, tone: PeekSegment["tone"]): PeekSegment => ({ text, tone })

const cut = (text: string, columns: number) => (text.length > columns ? `${text.slice(0, columns - 1)}…` : text)

// A path keeps its file name, the part that tells two paths apart.
const cutFromLeft = (text: string, columns: number) =>
  text.length > columns ? `…${text.slice(text.length - columns + 1)}` : text

const lineWidth = (line: readonly PeekSegment[]) =>
  line.reduce((width, segment) => width + segment.text.length, 0) + Math.max(0, line.length - 1)

function dateText(date: string, now: number): string {
  const ago = formatTimeAgo(date, now)
  return `${date.slice(0, 10)} (${ago === "now" ? "just now" : `${ago} ago`})`
}

function bodyOf(input: BlamePeekInput, columns: number): PeekSegment[][] {
  if (input.status === "loading") return [[seg("Reading blame…", "dim")]]
  if (input.status === "error") return [[seg(cut(input.message, columns), "red")]]
  const { result } = input
  if (!result) return [[seg("No blame for this line: the file is not on this side", "dim")]]
  if (result.line.kind === "uncommitted") return [[seg("Not committed yet", "yellow")]]
  const { commit } = result.line
  return [
    [seg(commit.shortSha, "peach"), seg(cut(commit.author, Math.max(1, columns - commit.shortSha.length - 1)), "text")],
    [seg(dateText(commit.date, input.now), "dim")],
    [seg(cut(commit.subject, columns), "text")],
    ...(result.pr ? [[seg(`#${result.pr.number}`, "blue")]] : []),
  ]
}

function footerOf(input: BlamePeekInput): string {
  if (input.status !== "ready" || input.result?.line.kind !== "commit") return "Esc: close"
  const open = input.result.pr ? `go: open PR #${input.result.pr.number}` : "go: open commit"
  return `${open} · y: copy sha · Esc: close`
}

/**
 * Who last changed the cursor's line, and why: the commit's subject is the
 * why a diff never shows.
 */
export function blamePeekModel(input: BlamePeekInput): PeekModel {
  const { target, terminalWidth } = input
  const ceiling = Math.min(MAX_WIDTH, terminalWidth - 4)
  const columns = Math.max(1, ceiling - PADDING * 2)

  const sideSegment = seg(target.side, target.side === "head" ? "green" : "peach")
  const place = cutFromLeft(`${target.path}:${target.line}`, Math.max(1, columns - sideSegment.text.length - 1))
  const header = [seg(place, "primary"), sideSegment]
  const lines = bodyOf(input, columns)
  const footer = footerOf(input)
  const longest = Math.max(lineWidth(header), footer.length, ...lines.map(lineWidth))

  return {
    id: "blame-peek",
    width: Math.min(ceiling, Math.max(MIN_WIDTH, longest + PADDING * 2)),
    background: "mantle",
    header,
    body: { kind: "lines", lines },
    footer,
  }
}

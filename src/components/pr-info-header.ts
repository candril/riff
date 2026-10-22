import type { PrInfo, PrReview } from "../providers/github/types"
import type { PRInfoPanelSection } from "../state"
import { theme } from "../theme"
import { stackText, type StackInfo } from "../utils/stack"
import { fitSpans, type SummarySpan } from "./fit-spans"
import type { SectionConfig } from "./pr-info-sections"

export interface SectionHeaderRow {
  key: PRInfoPanelSection
  /** The flash label in front of the header, while `s` is labelling (spec 066). */
  label: string | null
  text: string
  fg: string
  /** Drawn after the text, two cells on. Cut with the text to the row's width, `…` where it is cut. */
  summary: SummarySpan[]
  highlighted: boolean
}

const SUMMARY_GAP = 2

export function sectionHeaderRow(
  config: SectionConfig,
  { active, expanded, highlighted, label, width = Infinity }: {
    active: boolean
    expanded: boolean
    highlighted: boolean
    label: string | null
    /** The cells the header is drawn in; it is never wrapped onto a second row. */
    width?: number
  }
): SectionHeaderRow {
  const indicator = expanded ? "▼" : "▶"
  const fg = active ? theme.blue : theme.overlay0
  const text = config.count === null
    ? `${indicator}  ${config.title}`
    : `${indicator}  ${config.title} (${config.count}${config.countSuffix ?? ""})`
  const summary = expanded ? config.openSummary ?? [] : config.summary
  // The label goes first and is never cut: it is what `s` asks the reader to type.
  const room = width - (label === null ? 0 : Bun.stringWidth(`${label} `))
  return { key: config.id, label, fg, ...fitHeader(text, fg, summary, room), highlighted }
}

function fitHeader(text: string, fg: string, summary: SummarySpan[], width: number) {
  const textWidth = Bun.stringWidth(text)
  const left = width - textWidth - SUMMARY_GAP
  if (summary.length > 0 && left >= 1) return { text, summary: fitSpans(summary, left) }
  if (summary.length === 0 && textWidth <= width) return { text, summary }
  // Not even the summary's `…` fits after the gap, so the title carries it.
  const cut = fitSpans([{ text, fg }, { text: "…", fg }], Math.min(textWidth, width))
  return { text: cut.map((span) => span.text).join(""), summary: [] }
}

/**
 * What the header line above the panel does not already say (spec 067):
 * the title, the status, the change counts and the checks are up there or
 * in the sections below.
 */
export interface PanelMeta {
  author: string
  branches: string
  /** Who has approved: the one review state that decides whether this can merge. */
  approvers: string[]
}

export function panelMeta(prInfo: PrInfo): PanelMeta {
  return {
    author: prInfo.author,
    branches: `${prInfo.headRef} → ${prInfo.baseRef}`,
    approvers: [...latestReviewStates(prInfo.reviews ?? [])]
      .filter(([, state]) => state === "APPROVED")
      .map(([author]) => author),
  }
}

/**
 * Each reviewer's standing verdict, in the order they first gave one. A later
 * review from the same person supersedes an earlier one: an approval followed
 * by "changes requested" is not an approval. A comment changes nobody's verdict.
 */
export function latestReviewStates(reviews: readonly PrReview[]): Map<string, PrReview["state"]> {
  const latestByAuthor = new Map<string, PrReview["state"]>()
  for (const review of [...reviews].sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""))) {
    if (review.state !== "COMMENTED" && review.state !== "PENDING") latestByAuthor.set(review.author, review.state)
  }
  return latestByAuthor
}

export interface StackLine {
  text: string
  fg: string
  visible: boolean
}

/**
 * The row naming the PR this one is stacked on (spec 072). `undefined` is
 * not known yet: the stack is read a moment after the panel opens, so the
 * row holds its place from the start and says nothing until then. `null`
 * is not stacked, and the row goes.
 */
export function stackLine(stack: StackInfo | null | undefined): StackLine {
  return {
    text: stack ? stackText(stack) : "",
    fg: stack?.status === "rewritten" ? theme.yellow : theme.subtext0,
    visible: stack !== null,
  }
}

import type { PrInfo, PrReview } from "../providers/github/types"
import type { PRInfoPanelSection } from "../state"
import { theme } from "../theme"
import { stackText, type StackInfo } from "../utils/stack"
import type { SectionConfig } from "./pr-info-sections"

export interface SectionHeaderRow {
  key: PRInfoPanelSection
  /** The flash label in front of the header, while `s` is labelling (spec 066). */
  label: string | null
  text: string
  fg: string
  /** What a collapsed section says at a glance, drawn after the text. */
  preview: string | null
  highlighted: boolean
}

export function sectionHeaderRow(
  config: SectionConfig,
  { active, expanded, highlighted, label }: { active: boolean; expanded: boolean; highlighted: boolean; label: string | null }
): SectionHeaderRow {
  const indicator = expanded ? "▼" : "▶"
  return {
    key: config.id,
    label,
    text: `${indicator}  ${config.title} (${config.count}${config.countSuffix ?? ""})`,
    fg: active ? theme.blue : theme.overlay0,
    preview: config.preview && !expanded ? config.preview : null,
    highlighted,
  }
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
  // A later review from the same person supersedes an earlier one: an
  // approval followed by "changes requested" is not an approval.
  const latestByAuthor = new Map<string, PrReview>()
  for (const review of [...(prInfo.reviews ?? [])].sort((a, b) =>
    (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "")
  )) {
    if (review.state !== "COMMENTED" && review.state !== "PENDING") latestByAuthor.set(review.author, review)
  }
  return {
    author: prInfo.author,
    branches: `${prInfo.headRef} → ${prInfo.baseRef}`,
    approvers: [...latestByAuthor.values()]
      .filter((review) => review.state === "APPROVED")
      .map((review) => review.author),
  }
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

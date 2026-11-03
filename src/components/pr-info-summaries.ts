/**
 * What each folded section header says at a glance, in colour by meaning:
 * the answer the eye looks for in an accent, counts and times readable but
 * quieter than the section name (spec 067).
 */

import type { PrCommit } from "../providers/github/types"
import { theme } from "../theme"
import { previewState, type PreviewRow, type PreviewSet } from "../utils/previews"
import type { SummarySpan } from "./fit-spans"
import { formatTimeAgo } from "./pr-info-format"
import type { ConversationItem } from "./pr-info-items"

const quiet = (text: string): SummarySpan => ({ text, fg: theme.subtext0 })

/**
 * Who posted the previews, how many are up and how many are on their way
 * — the rows themselves are one line per app (spec 068, spec 113). The
 * comment's table has no failed or expired state to tell apart.
 */
export function previewsSummary(previews: PreviewSet | null, visible: PreviewRow[]): SummarySpan[] {
  if (!previews) return []
  const live = visible.filter((row) => previewState(row) === "live").length
  const underway = visible.filter((row) => previewState(row) === "building" || previewState(row) === "requested").length
  const other = visible.length - live - underway
  const counts = [
    live > 0 ? { text: `${live} live`, fg: theme.green } : null,
    underway > 0 ? { text: `${underway} building`, fg: theme.yellow } : null,
    other > 0 ? quiet(`${other} on demand`) : null,
  ].filter((span): span is SummarySpan => span !== null)
  const joined = counts.flatMap((span, i) => (i === 0 ? [span] : [quiet(" · "), span]))
  return [
    ...joined,
    ...(joined.length > 0 ? [quiet("  ·  ")] : []),
    quiet("from "),
    { text: previews.author, fg: theme.overlay1 },
  ]
}

/** What is still open, since a resolved thread is not something to come back to. */
export function unresolvedSummary(conversationItems: ConversationItem[]): SummarySpan[] {
  let unresolved = 0
  for (const item of conversationItems) {
    if (item.type !== 'review') continue
    unresolved += item.data.threads.filter((thread) => thread.heldOpen).length
  }
  return unresolved > 0 ? [{ text: `${unresolved} unresolved`, fg: theme.yellow }] : []
}

export function lastCommitSummary(commits: PrCommit[], now: number = Date.now()): SummarySpan[] {
  const last = commits[commits.length - 1]
  return last ? [quiet(`last ${formatTimeAgo(last.date, now)}`)] : []
}

export function filesSummary(additions: number, deletions: number): SummarySpan[] {
  return [{ text: `+${additions}`, fg: theme.green }, quiet(" "), { text: `-${deletions}`, fg: theme.red }]
}

export function descriptionSummary(lines: number): SummarySpan[] {
  return [quiet(lines > 0 ? `${lines} lines` : "empty")]
}

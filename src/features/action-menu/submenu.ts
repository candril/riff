/**
 * Action-menu submenu row building (spec 042).
 *
 * When the palette is in a submenu, render.ts and input.ts both need the
 * same filtered-and-ordered row list. This module is the single place that
 * turns `state.actionMenu.submenu` + `state.actionMenu.query` into rows.
 */

import type { AppState } from "../../state"
import { getReactionsForTarget } from "../../state"
import type { SubmenuRow } from "../../components"
import { REACTION_CONTENT, REACTION_META, type ReactionContent } from "../../types"
import { fuzzyFilter } from "../../utils/fuzzy"

/**
 * Build the 8 reaction rows for the React… submenu, reflecting the
 * current (optimistically-updated) reaction state for the target.
 */
function buildReactionRows(state: AppState): SubmenuRow[] {
  const submenu = state.actionMenu.submenu
  if (submenu?.kind !== "react") return []
  const summaries = getReactionsForTarget(state, submenu.target)
  const byContent = new Map<ReactionContent, { count: number; viewerHasReacted: boolean }>()
  for (const s of summaries) byContent.set(s.content, s)

  return REACTION_CONTENT.map(content => {
    const meta = REACTION_META[content]
    const summary = byContent.get(content)
    const count = summary?.count ?? 0
    const reacted = summary?.viewerHasReacted ?? false
    const trailing = reacted
      ? (count > 1 ? `${count} · you reacted` : "you reacted")
      : (count > 0 ? String(count) : "")
    return {
      id: `react:${content}`,
      icon: meta.emoji,
      label: meta.label,
      trailing: trailing || undefined,
      accented: reacted,
    } satisfies SubmenuRow
  })
}

/**
 * Return the current submenu's rows, filtered by the palette query.
 * Returns [] when the palette isn't in submenu mode.
 */
export function getSubmenuRows(state: AppState): SubmenuRow[] {
  const submenu = state.actionMenu.submenu
  if (!submenu) return []

  let rows: SubmenuRow[]
  switch (submenu.kind) {
    case "react":
      rows = buildReactionRows(state)
      break
  }

  const q = state.actionMenu.query
  if (!q) return rows
  return fuzzyFilter(q, rows, row => [row.label, row.id])
}

/**
 * Resolve a submenu row's id back into its reaction content. Returns null
 * for non-reaction rows.
 */
export function reactionContentFromRowId(id: string): ReactionContent | null {
  if (!id.startsWith("react:")) return null
  const content = id.slice("react:".length) as ReactionContent
  if ((REACTION_CONTENT as readonly string[]).includes(content)) return content
  return null
}

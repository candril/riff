/**
 * Action-menu submenu row building (spec 042).
 *
 * When the palette is in a submenu, its frame model (the actionMenu entry
 * of frameModels, which the action-menu island in app/pickers.tsx draws)
 * and its keys (keys.ts) both need the same filtered-and-ordered row list. This
 * module is the single place that turns the palette's submenu and query, read
 * off its factory (state.ts), into rows.
 */

import type { AppState } from "../../state"
import { getReactionsForTarget } from "../../state"
import type { SubmenuRow } from "../../components"
import { REACTION_CONTENT, REACTION_META, type ReactionContent } from "../../types"
import { fuzzyFilterMatches, fuzzyMatchPositions } from "../../utils/fuzzy"
import type { ActionSubmenu } from "../../actions/types"
import type { ActionMenuSnapshot } from "./state"

/**
 * Build the 8 reaction rows for the React… submenu, reflecting the
 * current (optimistically-updated) reaction state for the target.
 */
function buildReactionRows(state: AppState, submenu: Extract<ActionSubmenu, { kind: "react" }>): SubmenuRow[] {
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
export function getSubmenuRows(
  state: AppState,
  { submenu, query }: Pick<ActionMenuSnapshot, "submenu" | "query">
): SubmenuRow[] {
  if (!submenu) return []

  let rows: SubmenuRow[]
  switch (submenu.kind) {
    case "react":
      rows = buildReactionRows(state, submenu)
      break
    case "links":
      rows = submenu.links.map((link, index) => ({
        id: `link:${index}`,
        icon: "🔗",
        label: link.label,
        trailing: link.detail,
      }))
      break
  }

  if (!query) return rows
  return fuzzyFilterMatches(query, rows, row => [row.label, row.trailing ?? "", row.id]).map(({ item, field, positions }) => {
    if (field === 0) return { ...item, labelMatched: positions }
    if (field === 1) return { ...item, trailingMatched: positions }
    // The id is not drawn: a row ranked on it shows the label's own match, else the note's, if either has one.
    const label = fuzzyMatchPositions(query, item.label)?.positions
    if (label) return { ...item, labelMatched: label }
    const trailing = item.trailing ? fuzzyMatchPositions(query, item.trailing)?.positions : undefined
    return trailing ? { ...item, trailingMatched: trailing } : item
  })
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

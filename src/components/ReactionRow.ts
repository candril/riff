/**
 * Compact pill row showing non-zero reactions on a comment/review/body.
 * Viewer-reacted pills get an accented background so it's obvious which
 * ones a Ctrl+p → React… → Enter would toggle off (spec 042).
 *
 * Returns null when there are no reactions — callers can mount the result
 * directly without gating themselves.
 */

import { Box, Text } from "@opentui/core"
import { theme } from "../theme"
import type { ReactionSummary } from "../types"
import { REACTION_META } from "../types"

export interface ReactionRowProps {
  reactions: ReactionSummary[] | undefined
}

export function ReactionRow({ reactions }: ReactionRowProps) {
  if (!reactions || reactions.length === 0) return null

  const visible = reactions.filter(r => r.count > 0 || r.viewerHasReacted)
  if (visible.length === 0) return null

  return Box(
    {
      flexDirection: "row",
      gap: 1,
      paddingTop: 1,
    },
    ...visible.map(r => ReactionPill({ reaction: r }))
  )
}

function ReactionPill({ reaction }: { reaction: ReactionSummary }) {
  const meta = REACTION_META[reaction.content]
  const bg = reaction.viewerHasReacted ? theme.surface1 : undefined
  const fg = reaction.viewerHasReacted ? theme.text : theme.subtext1
  return Box(
    {
      flexDirection: "row",
      paddingX: 1,
      backgroundColor: bg,
    },
    Text({ content: `${meta.emoji} ${reaction.count}`, fg })
  )
}

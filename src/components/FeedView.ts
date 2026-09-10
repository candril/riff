import { Box, Text } from "@opentui/core"
import { colors } from "../theme"

export interface FeedViewProps {
  /** Rows the feed would show. Empty until spec 070 fills the stream in. */
  rows: string[]
}

/**
 * The activity feed (specs 064, 070) — what happened to this PR, newest
 * first. `a` reaches it from any view and takes you back.
 */
export function FeedView({ rows }: FeedViewProps) {
  return Box(
    {
      id: "feed-view",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      paddingTop: 1,
      paddingLeft: 2,
      paddingRight: 2,
    },
    Text({ content: "Feed", fg: colors.headerFg, attributes: 1 }),
    Text({ content: "" }),
    ...(rows.length === 0
      ? [Text({ content: "Nothing here yet — `d` for the diff, `i` for the PR.", fg: colors.textDim })]
      : rows.map((row) => Text({ content: row, fg: colors.text })))
  )
}

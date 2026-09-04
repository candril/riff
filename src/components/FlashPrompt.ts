/**
 * FlashPrompt - Flash mode input line shown at the bottom of the diff view
 *
 * Occupies the same slot as SearchPrompt (the two modes are mutually
 * exclusive) and echoes what has been typed plus how many targets are live.
 */

import { Box, Text } from "@opentui/core"
import { theme } from "../theme"
import type { FlashState } from "../vim-diff/flash-state"

export interface FlashPromptProps {
  flashState: FlashState
}

export function FlashPrompt({ flashState }: FlashPromptProps) {
  if (!flashState.active) {
    return Box({ height: 0 })
  }

  const noMatches = flashState.pattern.length > 0 && flashState.matches.length === 0
  const hint = noMatches
    ? "no targets"
    : flashState.matches.length > 0
      ? `${flashState.matches.length} target${flashState.matches.length === 1 ? "" : "s"}`
      : "type to jump"

  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: theme.surface0,
      flexDirection: "row",
      paddingLeft: 1,
      gap: 1,
    },

    Text({ content: "flash", fg: theme.mauve }),

    Text({
      content: flashState.pattern,
      fg: noMatches ? theme.red : theme.text,
    }),

    Text({
      content: `(${hint})`,
      fg: noMatches ? theme.red : theme.overlay1,
    }),
  )
}

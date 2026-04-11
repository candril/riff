/**
 * Persistent notification shown when Claude has drafted an inline PR
 * comment (spec 036). Pinned to the bottom-right. Unlike `Toast`, this
 * does **not** auto-dismiss — it stays visible across navigation until
 * the user reviews, dismisses, or the draft file is removed from disk.
 *
 * The component is display-only. All interactions happen via the action
 * menu ("Claude: Review drafted comment" / "Claude: Dismiss drafted
 * comment") so there's no keyboard handling here.
 *
 * Layout modelled on presto's NotificationToast but stripped of the
 * auto-dismiss timer and the `useKeyboard` dismiss.
 */

import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"
import type { DraftNotificationState } from "../state"

export interface DraftNotificationProps {
  notification: DraftNotificationState
}

export function DraftNotification({ notification }: DraftNotificationProps) {
  const { filename, line, startLine, side, bodyPreview } = notification

  const range =
    startLine !== undefined && startLine !== line
      ? `${startLine}-${line}`
      : String(line)

  const target = `${filename}:${range}${side === "LEFT" ? " (−)" : ""}`

  return Box(
    {
      id: "draft-notification",
      position: "absolute",
      bottom: 2,
      right: 2,
      minWidth: 48,
      maxWidth: 72,
      flexDirection: "column",
      backgroundColor: colors.headerBg,
      paddingX: 2,
      paddingY: 1,
      zIndex: 100,
      borderStyle: "rounded",
      borderColor: theme.blue,
    },
    Text({
      content: "Claude drafted a comment",
      fg: theme.blue,
    }),
    Text({ content: target, fg: colors.text }),
    Text({ content: bodyPreview, fg: colors.textMuted }),
    Text({
      content: "gd review  ·  gD discard",
      fg: colors.textDim,
    }),
  )
}

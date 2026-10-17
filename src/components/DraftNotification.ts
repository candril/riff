/**
 * Persistent notification shown when Claude has drafted an inline PR
 * comment (spec 036). Pinned to the bottom-right. Unlike `Toast`, this
 * does **not** auto-dismiss — it stays visible until the user dismisses
 * it or the draft file is removed from disk.
 *
 * The component is display-only; copying and discarding are palette
 * actions (they were `gd`/`gD` until those became the editor diff).
 *
 * Every line is pre-wrapped and clamped by the model rather than left to
 * opentui's own wrapping: an absolutely-positioned box sizes itself as if
 * each Text child were a single row, so wrapped children overflow and paint
 * on top of each other.
 */

import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"
import type { DraftNotificationState } from "../state"
import { draftNotificationModel } from "./notification-model"

export interface DraftNotificationProps {
  notification: DraftNotificationState
}

const WIDTH = 64
const BORDER = 2
const PADDING_X = 2
const PADDING_Y = 1
const INNER_WIDTH = WIDTH - BORDER - PADDING_X * 2

export function DraftNotification({ notification }: DraftNotificationProps) {
  const model = draftNotificationModel(notification, INNER_WIDTH)
  const rows = 2 + model.preview.length + 1

  return Box(
    {
      id: "draft-notification",
      position: "absolute",
      bottom: 2,
      right: 2,
      width: WIDTH,
      height: rows + BORDER + PADDING_Y * 2,
      flexDirection: "column",
      backgroundColor: colors.headerBg,
      paddingX: PADDING_X,
      paddingY: PADDING_Y,
      zIndex: 100,
      borderStyle: "rounded",
      borderColor: theme.blue,
    },
    Text({ content: model.title, fg: theme.blue }),
    Text({ content: model.target, fg: colors.text }),
    ...model.preview.map((ln) => Text({ content: ln, fg: colors.textMuted })),
    Text({ content: model.hint, fg: colors.textDim }),
  )
}

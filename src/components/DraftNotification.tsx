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

import { For } from "solid-js"
import { colors, theme } from "../theme"
import type { DraftNotificationModel } from "./notification-model"

const WIDTH = 64
const PADDING_X = 2
const PADDING_Y = 1
export const DRAFT_INNER_WIDTH = WIDTH - PADDING_X * 2

export function DraftNotification(props: { model: DraftNotificationModel }) {
  const rows = () => 2 + props.model.preview.length + 1

  return (
    <box
      width={WIDTH}
      height={rows() + PADDING_Y * 2}
      flexDirection="column"
      backgroundColor={theme.mantle}
      paddingX={PADDING_X}
      paddingY={PADDING_Y}
    >
      <text fg={theme.blue}>{props.model.title}</text>
      <text fg={colors.text}>{props.model.target}</text>
      <For each={props.model.preview}>{(line) => <text fg={colors.textMuted}>{line}</text>}</For>
      <text fg={colors.textDim}>{props.model.hint}</text>
    </box>
  )
}

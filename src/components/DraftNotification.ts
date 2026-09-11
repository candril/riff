/**
 * Persistent notification shown when Claude has drafted an inline PR
 * comment (spec 036). Pinned to the bottom-right. Unlike `Toast`, this
 * does **not** auto-dismiss — it stays visible until the user dismisses
 * it or the draft file is removed from disk.
 *
 * The component is display-only; copying and discarding are palette
 * actions (they were `gd`/`gD` until those became the editor diff).
 *
 * Every line is pre-wrapped and clamped here rather than left to opentui's
 * own wrapping: an absolutely-positioned box sizes itself as if each Text
 * child were a single row, so wrapped children overflow and paint on top
 * of each other.
 */

import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"
import type { DraftNotificationState } from "../state"

export interface DraftNotificationProps {
  notification: DraftNotificationState
}

const WIDTH = 64
const BORDER = 2
const PADDING_X = 2
const PADDING_Y = 1
const INNER_WIDTH = WIDTH - BORDER - PADDING_X * 2
const MAX_PREVIEW_LINES = 3

export function DraftNotification({ notification }: DraftNotificationProps) {
  const { filename, line, startLine, side, bodyPreview } = notification

  const range =
    startLine !== undefined && startLine !== line
      ? `${startLine}-${line}`
      : String(line)

  const target = truncateStart(
    `${filename}:${range}${side === "LEFT" ? " (−)" : ""}`,
    INNER_WIDTH,
  )
  const previewLines = wrap(bodyPreview, INNER_WIDTH, MAX_PREVIEW_LINES)

  const rows = 2 + previewLines.length + 1

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
    Text({ content: "Claude drafted a comment", fg: theme.blue }),
    Text({ content: target, fg: colors.text }),
    ...previewLines.map((ln) => Text({ content: ln, fg: colors.textMuted })),
    Text({ content: "Ctrl+p: copy or discard it", fg: colors.textDim }),
  )
}

/** Keep the tail (filename + line), which identifies the target best. */
function truncateStart(text: string, width: number): string {
  if (text.length <= width) return text
  return "…" + text.slice(text.length - (width - 1))
}

/**
 * Greedy word wrap, clamped to `maxLines` with an ellipsis on the last
 * line when the text doesn't fit.
 */
function wrap(text: string, width: number, maxLines: number): string[] {
  const lines = wrapAll(text, width)
  if (lines.length <= maxLines) return lines

  const clamped = lines.slice(0, maxLines)
  const last = clamped[maxLines - 1] ?? ""
  clamped[maxLines - 1] = last.slice(0, Math.max(0, width - 1)) + "…"
  return clamped
}

function wrapAll(text: string, width: number): string[] {
  const lines: string[] = []
  let current = ""

  for (let word of text.split(/\s+/).filter((w) => w.length > 0)) {
    // Hard-break words wider than the box (URLs, long identifiers).
    while (word.length > width) {
      if (current.length > 0) {
        lines.push(current)
        current = ""
      }
      lines.push(word.slice(0, width))
      word = word.slice(width)
    }

    if (current.length === 0) current = word
    else if (current.length + 1 + word.length <= width) current = `${current} ${word}`
    else {
      lines.push(current)
      current = word
    }
  }

  if (current.length > 0) lines.push(current)
  return lines
}

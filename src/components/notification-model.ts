import type { DraftNotificationState } from "../state"

export type ToastType = "success" | "error" | "info"

/** What a toast shows; `tone` picks its colour. */
export interface ToastModel {
  icon: string
  message: string
  tone: ToastType
}

const TOAST_ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✗",
  info: "i",
}

export function toastModel(message: string, type: ToastType): ToastModel {
  return { icon: TOAST_ICONS[type], message, tone: type }
}

/** What Claude's draft notice shows, every line already fitted to the box. */
export interface DraftNotificationModel {
  title: string
  target: string
  preview: string[]
  hint: string
}

const MAX_PREVIEW_LINES = 3

export function draftNotificationModel(n: DraftNotificationState, innerWidth: number): DraftNotificationModel {
  const { filename, line, startLine, side, bodyPreview } = n

  const range =
    startLine !== undefined && startLine !== line
      ? `${startLine}-${line}`
      : String(line)

  return {
    title: "Claude drafted a comment",
    target: truncateStart(`${filename}:${range}${side === "LEFT" ? " (−)" : ""}`, innerWidth),
    preview: wrap(bodyPreview, innerWidth, MAX_PREVIEW_LINES),
    hint: "Ctrl+p: copy or discard it",
  }
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

import type { PrCheck, PrReview } from "../providers/github"
import { theme } from "../theme"
import type { ReviewThread } from "./pr-info-conversation"

/**
 * Format a relative time string (compact, no "ago")
 */
export function formatTimeAgo(isoDate: string, now: number = Date.now()): string {
  const date = new Date(isoDate)
  const diffMs = now - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "now"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 30) return `${diffDays}d`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`
  return `${Math.floor(diffDays / 365)}y`
}

/**
 * Width of the relative-time column in the Conversation section. Sized
 * for the widest string `formatTimeAgo` produces ("11mo") so the times
 * line up across rows that otherwise have very different shapes.
 */
export const TIME_COLUMN_WIDTH = 4

/**
 * Last activity on a thread. The time column reads as "when did this
 * last move", so a thread reports its newest reply rather than when it
 * was opened — an old thread with a fresh reply shouldn't look stale.
 */
export function threadActivityAt(thread: ReviewThread): string {
  return thread.replies[thread.replies.length - 1]?.createdAt ?? thread.createdAt
}

/**
 * Get review state icon and color
 */
export function getReviewIcon(state: PrReview["state"]): { icon: string; color: string } {
  switch (state) {
    case "APPROVED":
      return { icon: "✓", color: theme.green }
    case "CHANGES_REQUESTED":
      return { icon: "✗", color: theme.red }
    case "COMMENTED":
      return { icon: "○", color: theme.subtext0 }
    case "PENDING":
      return { icon: "○", color: theme.yellow }
    case "DISMISSED":
      return { icon: "─", color: theme.overlay0 }
  }
}

/**
 * Get icon and color for a check status
 */
export function getCheckStatusDisplay(check: PrCheck): { icon: string; color: string } {
  if (check.status !== "completed") {
    // In progress or queued
    return { icon: "○", color: theme.yellow }
  }

  switch (check.conclusion) {
    case "success":
      return { icon: "✓", color: theme.green }
    case "failure":
    case "timed_out":
      return { icon: "✗", color: theme.red }
    case "cancelled":
      return { icon: "⊘", color: theme.overlay0 }
    case "skipped":
      return { icon: "⊘", color: theme.overlay0 }
    case "neutral":
      return { icon: "◇", color: theme.subtext0 }
    case "action_required":
      return { icon: "!", color: theme.peach }
    default:
      return { icon: "?", color: theme.overlay0 }
  }
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + "…"
}

/**
 * Clean up a comment body for single-line preview display.
 * Strips HTML comments, markdown noise, collapses whitespace.
 */
export function cleanBodyPreview(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, "")      // Remove HTML comments
    .replace(/<[^>]+>/g, "")               // Remove HTML tags
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/^#{1,6}\s+/gm, "")           // Remove heading markers
    .replace(/^[ \t|:-]*---[ \t|:-]*$/gm, "") // Remove table separator rows
    .replace(/[:\-|]{3,}/g, "")            // Remove rules
    .replace(/\|/g, " ")                   // Keep table cells, not their borders
    .replace(/^\s*[-*+]\s+/gm, "")         // Remove list markers
    .replace(/`{1,3}/g, "")               // Remove backticks
    .replace(/\n/g, " ")                   // Collapse newlines to spaces
    .replace(/\s+/g, " ")                  // Collapse multiple spaces
    .trim()
}
